import { AdaptadorBancario, PagoPasajeParams, ResultadoPago } from "./types";

export const TRUFI_API = "https://api-banco-trufi.onrender.com";

async function req<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${TRUFI_API}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  const data = await res.json();
  if (!res.ok && !data.mensaje) {
    throw new Error(`Error del servidor bancario (${res.status})`);
  }
  return data as T;
}

export class AdaptadorTrufi implements AdaptadorBancario {
  id: string;
  nombre: string;

  constructor(id: string = "trufi", nombre: string = "Banco Trufi") {
    this.id = id;
    this.nombre = nombre;
  }

  async crearCuenta(cuentaId: string, titular: string, saldoInicial?: number) {
    const r = await req<{ ok: boolean }>("/api/banco/crear-cuenta", {
      method: "POST",
      body: JSON.stringify({ cuentaId, titular, saldoInicial }),
    });
    return r.ok;
  }

  async consultarSaldo(cuentaId: string) {
    const r = await req<{ ok: boolean; saldo: number }>(`/api/banco/saldo/${encodeURIComponent(cuentaId)}`);
    return Number(r.saldo ?? 0);
  }

  async recargar(cuentaId: string, monto: number) {
    const r = await req<{ ok: boolean; nuevoSaldo: number; mensaje?: string }>("/api/banco/recargar", {
      method: "POST",
      body: JSON.stringify({ cuentaId, monto }),
    });

    if (!r.ok) {
      throw new Error(r.mensaje || "Error al debitar del banco");
    }

    return Number(r.nuevoSaldo);
  }

  async pagarPasaje(params: PagoPasajeParams): Promise<ResultadoPago> {
    return {
      transaccionId: `app-local-${Date.now()}`,
      montoProcesado: params.monto,
      saldoRestanteOrigen: 0,
      mensaje: "Pasaje procesado internamente con Saldo Pago Justo",
    };
  }

  async retirarGanancias(cuentaId: string, monto: number): Promise<number> {
    const r = await req<{ ok: boolean; nuevoSaldo: number; mensaje?: string }>("/api/banco/retirar-ganancias", {
      method: "POST",
      body: JSON.stringify({ cuentaId, monto }),
    });

    if (!r.ok) {
      throw new Error(r.mensaje || "Error al retirar fondos al banco");
    }

    return Number(r.nuevoSaldo);
  }
}