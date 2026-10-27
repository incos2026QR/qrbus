import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

const bankApiUrl = "https://api-banco-trufi.onrender.com";
const unresolvedStatuses = ["wallet_reserved", "bank_credit_confirmed", "reconciliation_required"];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getPublishableKey() {
  const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }

  const legacyKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacyKey) return legacyKey;
  throw new Error("Supabase publishable key is not configured");
}

function getSecretKey() {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }

  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;
  throw new Error("Supabase secret key is not configured");
}

function rpcRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const requestId = crypto.randomUUID();

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "No autenticado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("Supabase server URL is missing");

    const userClient = createClient(supabaseUrl, getPublishableKey(), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, getSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authorization.slice("Bearer ".length);
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sesión inválida" }, 401);

    const body = (await request.json()) as { action?: unknown; amount?: unknown };

    if (body.action === "status") {
      const { data: pending, error: pendingError } = await admin
        .from("wallet_withdrawal_requests")
        .select("id,status")
        .eq("driver_id", authData.user.id)
        .in("status", unresolvedStatuses)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pendingError) throw new Error(`No se pudo consultar el retiro: ${pendingError.message}`);

      return json({
        ok: true,
        pending: Boolean(pending),
        requestId: pending?.id ?? null,
        status: pending?.status ?? null,
      });
    }

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
      return json({ error: "Ingresa un monto válido de hasta Bs 1.000" }, 400);
    }

    const { data: driver, error: driverError } = await userClient
      .from("drivers")
      .select("bank_account,status")
      .eq("id", authData.user.id)
      .single();
    if (driverError || !driver) return json({ error: "Perfil de chofer no encontrado" }, 404);
    if (driver.status !== "active") return json({ error: "El chofer no está activo" }, 403);
    if (!String(driver.bank_account ?? "").trim()) {
      return json({ error: "No tienes una cuenta bancaria registrada" }, 400);
    }

    const { data: reservationData, error: reservationError } = await admin.rpc(
      "reserve_bank_withdrawal",
      {
        _request_id: requestId,
        _driver_id: authData.user.id,
        _amount: amount,
      },
    );
    if (reservationError) return json({ error: reservationError.message }, 400);

    const reservation = rpcRow(
      reservationData as { wallet_balance: number; bank_account: string }[] | null,
    );
    if (!reservation) throw new Error("No se pudo reservar el saldo del retiro");

    let bankResponse: Response;
    let bankBody: { ok?: boolean; nuevoSaldo?: number; mensaje?: string };
    try {
      bankResponse = await fetch(`${bankApiUrl}/api/banco/retirar-ganancias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuentaId: reservation.bank_account, monto: amount }),
        signal: AbortSignal.timeout(15_000),
      });
      bankBody = await bankResponse.json();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "API bancaria no disponible";
      const { error: markError } = await admin.rpc("mark_bank_withdrawal_reconciliation", {
        _request_id: requestId,
        _error_message: detail,
      });
      if (markError) console.error("Could not mark withdrawal for reconciliation", markError);

      return json(
        {
          error:
            "El resultado bancario es incierto. El retiro quedó en revisión; no vuelvas a enviarlo.",
          requestId,
          reconciliationRequired: true,
        },
        502,
      );
    }

    if (!bankResponse.ok || !bankBody.ok) {
      const message = bankBody.mensaje || "El banco rechazó el retiro";
      const { data: refundedBalance, error: refundError } = await admin.rpc(
        "refund_bank_withdrawal",
        { _request_id: requestId, _error_message: message },
      );
      if (refundError) {
        throw new Error(`Retiro rechazado; no se pudo liberar la reserva (${requestId})`);
      }
      return json(
        { error: message, requestId, walletBalance: Number(refundedBalance) },
        bankResponse.status >= 400 ? bankResponse.status : 400,
      );
    }

    const bankBalance = Number(bankBody.nuevoSaldo);
    const { error: creditError } = await admin.rpc("mark_bank_withdrawal_credited", {
      _request_id: requestId,
      _bank_balance_after: Number.isFinite(bankBalance) ? bankBalance : null,
    });
    if (creditError) {
      console.error("Bank credited but confirmation could not be stored", {
        requestId,
        creditError,
      });
      const { error: markError } = await admin.rpc("mark_bank_withdrawal_reconciliation", {
        _request_id: requestId,
        _error_message: `Acreditación bancaria confirmada; registro pendiente: ${creditError.message}`,
      });
      if (markError) {
        console.error("Could not mark credited withdrawal for reconciliation", markError);
      }
      return json(
        {
          error: "El banco acreditó el retiro, pero el registro quedó pendiente de conciliación.",
          requestId,
          reconciliationRequired: true,
        },
        500,
      );
    }

    const { data: walletBalance, error: completionError } = await admin.rpc(
      "complete_bank_withdrawal",
      { _request_id: requestId },
    );
    if (completionError) {
      console.error("Bank credited but withdrawal completion failed", {
        requestId,
        completionError,
      });
      return json(
        {
          error: "El banco acreditó el retiro, pero el historial quedó pendiente de conciliación.",
          requestId,
          reconciliationRequired: true,
        },
        500,
      );
    }

    return json({
      ok: true,
      requestId,
      walletBalance: Number(walletBalance),
      bankBalance: Number.isFinite(bankBalance) ? bankBalance : null,
    });
  } catch (error) {
    console.error("bank-withdraw failed", { requestId, error });
    return json(
      {
        error: error instanceof Error ? error.message : "No se pudo procesar el retiro",
        requestId,
      },
      500,
    );
  }
});
