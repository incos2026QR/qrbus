import { AdaptadorTrufi } from "./trufi-adapter";
import type { AdaptadorBancario, PagoPasajeParams } from "./types";

export type { AdaptadorBancario, CuentaBancaria, PagoPasajeParams, PagoPasajeResultado } from "./types";
export { TRUFI_API, AdaptadorTrufi } from "./trufi-adapter";

/**
 * Registro de bancos soportados. Todos usan hoy la API simulada Trufi, pero
 * cada uno puede reemplazarse por su propio adaptador sin cambiar la app.
 */
export const ADAPTADORES: AdaptadorBancario[] = [
  new AdaptadorTrufi("union", "Banco Unión"),
  new AdaptadorTrufi("bnb", "Banco Nacional de Bolivia (BNB)"),
  new AdaptadorTrufi("bcp", "Banco de Crédito BCP"),
  new AdaptadorTrufi("mercantil", "Banco Mercantil Santa Cruz"),
  new AdaptadorTrufi("bisa", "Banco BISA"),
  new AdaptadorTrufi("ganadero", "Banco Ganadero"),
  new AdaptadorTrufi("fie", "Banco FIE"),
  new AdaptadorTrufi("sol", "Banco Sol"),
];

export const BANCOS = ADAPTADORES.map((a) => ({ id: a.id, nombre: a.nombre }));

const POR_DEFECTO = ADAPTADORES[0]!;

/** Devuelve el adaptador del banco indicado (por id o nombre). */
export function obtenerAdaptador(banco?: string | null): AdaptadorBancario {
  if (!banco) return POR_DEFECTO;
  const clave = banco.trim().toLowerCase();
  return (
    ADAPTADORES.find((a) => a.id === clave || a.nombre.toLowerCase() === clave) ??
    new AdaptadorTrufi(clave.replace(/\s+/g, "-"), banco)
  );
}

/** Mantiene el identificador de cuenta tal cual lo maneja el banco */
export function cleanAccount(input: string): string {
  return (input ?? "").trim();
}

/** Formato de visualización uniforme para cuentas bancarias. */
export function formatAccount(bankName?: string | null, account?: string | null): string {
  return `Banco: ${bankName?.trim() || "—"} | Cuenta: ${cleanAccount(account ?? "") || "—"}`;
}


// ---- Fachada: la app llama estas funciones y el adaptador resuelve el banco ----

export function createAccount(cuentaId: string, titular: string, banco?: string | null, saldo?: number) {
  return obtenerAdaptador(banco).crearCuenta(cuentaId, titular, saldo);
}

export function getBalance(cuentaId: string, banco?: string | null) {
  return obtenerAdaptador(banco).consultarSaldo(cuentaId);
}

export function topUp(cuentaId: string, monto: number, banco?: string | null) {
  return obtenerAdaptador(banco).recargar(cuentaId, monto);
}

// CÓDIGO CORREGIDO
export function payFare(params: PagoPasajeParams, banco?: string | null) {
  return Promise.resolve({
    transaccionId: `app-local-${Date.now()}`,
    montoProcesado: params.monto,
    saldoRestanteOrigen: 0,
    mensaje: "Pasaje procesado internamente con Saldo Pago Justo",
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
