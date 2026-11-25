// Web Bluetooth: enlace con la placa 'Trufi_Hardware_01'.
const SERVICE_UUID = 0xffe0;
const CHAR_UUID = 0xffe1;

type BTChar = { writeValue: (v: BufferSource) => Promise<void> };

let characteristic: BTChar | null = null;
let deviceName: string | null = null;

export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function linkedDeviceName(): string | null {
  return deviceName;
}

export async function linkHardware(): Promise<string> {
  if (!isBluetoothSupported()) throw new Error("Este navegador no soporta Web Bluetooth");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bt = (navigator as any).bluetooth;
  const device = await bt.requestDevice({
    filters: [{ name: "Trufi_Hardware_01" }],
    optionalServices: [SERVICE_UUID],
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  characteristic = await service.getCharacteristic(CHAR_UUID);
  deviceName = device.name ?? "Trufi_Hardware_01";
  device.addEventListener?.("gattserverdisconnected", () => {
    characteristic = null;
    deviceName = null;
  });
  return deviceName ?? "Trufi_Hardware_01";
}

type PaymentData = {
  amount: number;
  category: string;
  verification_code: string;
  tickets: number;
  fare_breakdown?:
    | {
        category: string;
        tickets: number;
        amount: number;
      }[]
    | null;
};

const CATEGORY_CODES: Record<string, string> = {
  general: "G",
  primaria: "P",
  secundaria: "S",
  universitario: "U",
  adulto_mayor: "A",
  discapacidad: "D",
};

function toCents(amount: number): number {
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 999999) {
    throw new Error("Monto fuera del rango que admite el tablero");
  }
  return cents;
}

/** Envía una transacción confirmada en tramas compactas compatibles con BLE. */
export async function sendPaymentOk(payment: PaymentData): Promise<void> {
  if (!characteristic) return;

  const code = String(payment.verification_code);
  const tickets = Number(payment.tickets);
  if (!/^\d{5}$/.test(code)) throw new Error("Código de validación inválido");
  if (!Number.isInteger(tickets) || tickets < 1 || tickets > 10) {
    throw new Error("Cantidad de pasajes inválida para el tablero");
  }

  const sourceItems =
    Array.isArray(payment.fare_breakdown) && payment.fare_breakdown.length > 0
      ? payment.fare_breakdown
      : [{ category: payment.category, tickets, amount: payment.amount }];
  const groupedItems = new Map<string, { tickets: number; cents: number }>();
  for (const item of sourceItems) {
    const categoryCode = CATEGORY_CODES[item.category];
    const itemTickets = Number(item.tickets);
    if (!categoryCode) throw new Error(`Categoría no admitida por el tablero: ${item.category}`);
    if (!Number.isInteger(itemTickets) || itemTickets < 1) {
      throw new Error("Desglose de pasajes inválido");
    }

    const existing = groupedItems.get(categoryCode) ?? { tickets: 0, cents: 0 };
    existing.tickets += itemTickets;
    existing.cents += toCents(Number(item.amount));
    groupedItems.set(categoryCode, existing);
  }

  const items = [...groupedItems.entries()];
  const groupedTickets = items.reduce((sum, [, item]) => sum + item.tickets, 0);
  const groupedCents = items.reduce((sum, [, item]) => sum + item.cents, 0);
  if (groupedTickets !== tickets || groupedCents !== toCents(payment.amount)) {
    throw new Error("El desglose no coincide con el total del pago");
  }

  const frames = [
    `B|${code}|${tickets}|${groupedCents}|${items.length}`,
    ...items.map(([category, item]) => `I|${category}|${item.tickets}|${item.cents}`),
    "E",
  ];
  const encoder = new TextEncoder();
  for (const frame of frames) {
    const data = encoder.encode(frame);
    if (data.length > 20) throw new Error("La trama del pago excede el límite BLE");
    await characteristic.writeValue(data);
  }
}
