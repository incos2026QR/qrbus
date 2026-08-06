import type {
  AdaptadorBancario,
  CuentaBancaria,
  PagoPasajeParams,
  PagoPasajeResultado,
} from "./types";

/** Endpoint de la API bancaria simulada Trufi. */
export const TRUFI_API = "https://api-banco-trufi.onrender.com";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${TRUFI_API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    ok?: boolean;
    mensaje?: string;
    error?: string;
  };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error ?? json.mensaje ?? "Error en la API bancaria");
  }
  return json;
}

/**
 * Adaptador para la API Trufi. Cada banco soportado (Banco Unión, BNB, BCP…)
 * usa una instancia con su propio identificador; así se puede cambiar el
 * endpoint de un banco sin tocar el resto de la aplicación.
 */
export class AdaptadorTrufi implements AdaptadorBancario {
  constructor(
    public readonly id: string,
    public readonly nombre: string,
  ) {}

  async crearCuenta(cuentaId: string, titular: string, saldo?: number): Promise<CuentaBancaria> {
    const r = await req<{ ok: boolean; cuenta: { titular: string; saldo: number } }>(
      "/api/banco/crear-cuenta",
      {
        method: "POST",
        body: JSON.stringify({ cuentaId, titular, ...(saldo != null ? { saldo } : {}) }),
      },
    );
    return { cuentaId, titular: r.cuenta.titular, saldo: Number(r.cuenta.saldo) };
  }

  async consultarSaldo(cuentaId: string): Promise<CuentaBancaria> {
    const r = await req<{ ok: boolean; cuenta: string; titular: string; saldo: number }>(
      `/api/banco/saldo/${encodeURIComponent(cuentaId)}`,
    );
    return { cuentaId: r.cuenta, titular: r.titular, saldo: Number(r.saldo) };
  }

  async recargar(cuentaId: string, monto: number): Promise<number> {
    const r = await req<{ ok: boolean; nuevoSaldo: number }>("/api/banco/recargar", {
      method: "POST",
      body: JSON.stringify({ cuentaId, monto }),
    });
    return Number(r.nuevoSaldo);
  }

  async pagarPasaje(params: PagoPasajeParams): Promise<PagoPasajeResultado> {
    const r = await req<{
      ok: boolean;
      mensaje: string;
      transaccion: { id: string; montoProcesado: number };
      saldoRestanteOrigen: number;
    }>("/api/banco/pagar-pasaje", { method: "POST", body: JSON.stringify(params) });
    return {
      transaccionId: r.transaccion.id,
      montoProcesado: Number(r.transaccion.montoProcesado),
      saldoRestanteOrigen: Number(r.saldoRestanteOrigen),
      mensaje: r.mensaje,
    };
  }
}
