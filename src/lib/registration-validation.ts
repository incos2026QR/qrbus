export function cleanPersonName(value: string): string {
  return value.normalize("NFC").replace(/[^\p{L}\s]/gu, "");
}

export function normalizePersonName(value: string): string {
  return cleanPersonName(value).trim().replace(/\s+/g, " ");
}

export function cleanCiNumber(value: string): string {
  return value.normalize("NFC").replace(/[^\p{L}\d-]/gu, "");
}

export function cleanBolivianPhoneInput(value: string): string {
  const cleaned = value.replace(/[^\d()+\-\s]/g, "");
  const plusIndex = cleaned.indexOf("+");
  return plusIndex < 0
    ? cleaned
    : `${cleaned.slice(0, plusIndex + 1)}${cleaned.slice(plusIndex + 1).replace(/\+/g, "")}`;
}

export function normalizeBolivianPhone(value: string): string | null {
  if (!/^\+?[\d\s()-]+$/.test(value.trim())) return null;
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("591") && digits.length === 11 ? digits.slice(3) : digits;
  return /^[567]\d{7}$/.test(local) ? local : null;
}

export function isValidBirthdate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return false;
  }
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return value <= today;
}

export function todayDateInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isValidOptionalEmail(value: string): boolean {
  return !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidBankAccount(value: string): boolean {
  return /^\d[\d-]*$/.test(value.trim());
}
