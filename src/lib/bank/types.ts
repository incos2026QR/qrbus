export interface CuentaBancaria {
  cuentaId: string;
  titular: string;
  saldo: number;
}

export interface PagoPasajeParams {
  monto: number;
  [key: string]: any;
}

export interface PagoPasajeResultado {
  transaccionId: string;
  montoProcesado: number;
  saldoRestanteOrigen: number;
  mensaje: string;
}

// Alias para mantener compatibilidad si se usó en otro archivo
export type ResultadoPago = PagoPasajeResultado;

export interface AdaptadorBancario {
  id: string;
  nombre: string;
  crearCuenta(cuentaId: string, titular: string, saldoInicial?: number): Promise<boolean>;
  consultarSaldo(cuentaId: string): Promise<number>;
  recargar(cuentaId: string, monto: number): Promise<number>;
  pagarPasaje(params: PagoPasajeParams): Promise<PagoPasajeResultado>;
  retirarGanancias?: (cuentaId: string, monto: number) => Promise<number>;
}