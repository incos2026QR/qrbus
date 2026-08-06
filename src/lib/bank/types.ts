// Patrón Adapter: contrato común para cualquier banco integrado.

export type CuentaBancaria = {
  cuentaId: string;
  titular: string;
  saldo: number;
};

export type PagoPasajeParams = {
  cuentaOrigen: string;
  cuentaDestino: string;
  monto: number;
  tarifaTipo: string;
  cantidadPasajes: number;
  latitud: number | null;
  longitud: number | null;
};

export type PagoPasajeResultado = {
  transaccionId: string;
  montoProcesado: number;
  saldoRestanteOrigen: number;
  mensaje: string;
};

/** Todo banco soportado debe implementar esta interfaz. */
export interface AdaptadorBancario {
  readonly id: string;
  readonly nombre: string;
  crearCuenta(cuentaId: string, titular: string, saldo?: number): Promise<CuentaBancaria>;
  consultarSaldo(cuentaId: string): Promise<CuentaBancaria>;
  recargar(cuentaId: string, monto: number): Promise<number>;
  pagarPasaje(params: PagoPasajeParams): Promise<PagoPasajeResultado>;
}
