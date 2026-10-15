import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

const bankApiUrl = "https://api-banco-trufi.onrender.com";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getPublishableKey() {
  const legacyKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacyKey) return legacyKey;

  const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (!keys) throw new Error("Supabase publishable key is not configured");
  const parsed = JSON.parse(keys) as Record<string, string>;
  if (!parsed.default) throw new Error("Default Supabase publishable key is not configured");
  return parsed.default;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const requestId = crypto.randomUUID();
  let admin: ReturnType<typeof createClient> | null = null;

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "No autenticado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase server credentials are missing");

    const userClient = createClient(supabaseUrl, getPublishableKey(), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authorization.slice("Bearer ".length);
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sesión inválida" }, 401);

    const body = (await request.json()) as { amount?: unknown };
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
      return json({ error: "Monto inválido" }, 400);
    }

    const { data: passenger, error: passengerError } = await userClient
      .from("passengers")
      .select("bank_account, status")
      .eq("id", authData.user.id)
      .single();

    if (passengerError || !passenger)
      return json({ error: "Perfil de pasajero no encontrado" }, 404);
    if (passenger.status !== "active") return json({ error: "El pasajero no está activo" }, 403);

    const bankAccount = String(passenger.bank_account ?? "").trim();
    if (!bankAccount)
      return json({ error: "El pasajero no tiene una cuenta bancaria registrada" }, 400);

    const { error: requestError } = await admin.from("wallet_topup_requests").insert({
      id: requestId,
      user_id: authData.user.id,
      amount,
      bank_account: bankAccount,
      status: "pending",
    });
    if (requestError) throw new Error(`No se pudo registrar la solicitud: ${requestError.message}`);

    let bankResponse: Response;
    let bankBody: { ok?: boolean; nuevoSaldo?: number; mensaje?: string };
    try {
      bankResponse = await fetch(`${bankApiUrl}/api/banco/recargar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuentaId: bankAccount, monto: amount }),
      });
      bankBody = await bankResponse.json();
    } catch {
      await admin
        .from("wallet_topup_requests")
        .update({
          status: "failed",
          error_message: "API bancaria no disponible",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      return json({ error: "No se pudo contactar a la API bancaria" }, 502);
    }

    if (!bankResponse.ok || !bankBody.ok) {
      const message = bankBody.mensaje || "El banco rechazó la recarga";
      await admin
        .from("wallet_topup_requests")
        .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
        .eq("id", requestId);
      return json({ error: message }, bankResponse.status >= 400 ? bankResponse.status : 400);
    }

    const { error: debitError } = await admin
      .from("wallet_topup_requests")
      .update({
        status: "bank_debited",
        bank_balance_after: Number(bankBody.nuevoSaldo),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    if (debitError)
      throw new Error(`Débito confirmado, pero no se pudo registrar: ${debitError.message}`);

    const { data: walletBalance, error: creditError } = await admin.rpc("finalize_bank_topup", {
      _request_id: requestId,
    });
    if (creditError) {
      throw new Error(`Débito confirmado; acreditación pendiente (${requestId})`);
    }

    return json({
      ok: true,
      requestId,
      walletBalance: Number(walletBalance),
      bankBalance: Number(bankBody.nuevoSaldo),
    });
  } catch (error) {
    console.error("bank-topup failed", { requestId, error });
    return json(
      {
        error: error instanceof Error ? error.message : "No se pudo procesar la recarga",
        requestId,
      },
      500,
    );
  }
});
