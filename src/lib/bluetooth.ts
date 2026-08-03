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
  return deviceName;
}

/** Envía 'OK:Monto' para encender el LED de estado y activar el buzzer. */
export async function sendPaymentOk(amount: number): Promise<void> {
  if (!characteristic) return;
  const data = new TextEncoder().encode(`OK:${amount.toFixed(2)}\n`);
  await characteristic.writeValue(data);
}
