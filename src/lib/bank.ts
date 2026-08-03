// Integración con la API bancaria simulada Trufi.
export const BANK_API = "https://api-banco-trufi.onrender.com";

/** Construye el accountId anteponiendo "CTA-" al texto ingresado por el usuario. */
export function toAccountId(input: string): string {
  const clean = input.trim().replace(/\s*-\s*/g, "-").replace(/\s+/g, "-").toUpperCase();
  if (!clean) return "";
  return clean.startsWith("CTA-") ? clean : `CTA-${clean}`;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BANK_API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & { ok?: boolean; mensaje?: string; error?: string };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error ?? json.mensaje ?? "Error en la API bancaria");
  }
  return json;
}

export type BankAccounts = Record<string, { titular: string; saldo: number }>;

export function listAccounts() {
  return req<{ ok: boolean; cuentas: BankAccounts }>("/api/banco/cuentas");
}

export function getBalance(cuentaId: string) {
  return req<{ ok: boolean; cuenta: string; titular: string; saldo: number }>(
    `/api/banco/saldo/${encodeURIComponent(cuentaId)}`,
  );
}

/** Si no se envía saldo, la API asigna 50.00 Bs por defecto. */
export function createAccount(cuentaId: string, titular: string, saldo?: number) {
  return req<{ ok: boolean; mensaje: string; cuenta: { titular: string; saldo: number } }>(
    "/api/banco/crear-cuenta",
    { method: "POST", body: JSON.stringify({ cuentaId, titular, ...(saldo != null ? { saldo } : {}) }) },
  );
}

export function topUp(cuentaId: string, monto: number) {
  return req<{ ok: boolean; mensaje: string; nuevoSaldo: number }>("/api/banco/recargar", {
    method: "POST",
    body: JSON.stringify({ cuentaId, monto }),
  });
}

export type PayFarePayload = {
  cuentaOrigen: string;
  cuentaDestino: string;
  monto: number;
  tarifaTipo: string;
  cantidadPasajes: number;
  latitud: number | null;
  longitud: number | null;
};

export type PayFareResult = {
  ok: boolean;
  mensaje: string;
  transaccion: {
    id: string;
    montoProcesado: number;
    tarifaTipo: string;
    cantidadPasajes: number;
    gps: { latitud: number | null; longitud: number | null };
    fecha: string;
  };
  saldoRestanteOrigen: number;
};

export function payFare(payload: PayFarePayload) {
  return req<PayFareResult>("/api/banco/pagar-pasaje", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Coordenadas GPS nativas del dispositivo. */
export function getCoords(): Promise<{ latitud: number | null; longitud: number | null }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return resolve({ latitud: null, longitud: null });
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitud: pos.coords.latitude, longitud: pos.coords.longitude }),
      () => resolve({ latitud: null, longitud: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}
