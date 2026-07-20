export type Category = "general" | "primaria" | "secundaria" | "adulto_mayor" | "discapacidad";

export const CATEGORIES: {
  value: Category;
  label: string;
  price: number;
  minAge?: number;
  maxAge?: number;
  requiresExtraDoc?: (age: number) => boolean;
  extraDocLabel?: string;
}[] = [
  { value: "general", label: "General", price: 3.0 },
  { value: "primaria", label: "Estudiante Primaria", price: 1.0, maxAge: 12 },
  {
    value: "secundaria",
    label: "Secundaria y Universitario",
    price: 2.0,
    requiresExtraDoc: (age) => age >= 18,
    extraDocLabel: "Carnet Universitario/Estudiantil",
  },
  { value: "adulto_mayor", label: "Adulto Mayor", price: 2.5, minAge: 60 },
  {
    value: "discapacidad",
    label: "Persona con Discapacidad",
    price: 2.5,
    requiresExtraDoc: () => true,
    extraDocLabel: "Carnet de Discapacidad",
  },
];

export function computeAge(birthdate: string): number {
  const b = new Date(birthdate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export function validateCategoryForAge(category: Category, age: number): string | null {
  const c = CATEGORIES.find((x) => x.value === category)!;
  if (c.maxAge !== undefined && age > c.maxAge) return `Máximo ${c.maxAge} años para ${c.label}`;
  if (c.minAge !== undefined && age < c.minAge) return `Mínimo ${c.minAge} años para ${c.label}`;
  return null;
}

export function qrColumnFor(category: Category): "qr_general_url" | "qr_primaria_url" | "qr_secundaria_url" | "qr_adulto_url" {
  switch (category) {
    case "primaria": return "qr_primaria_url";
    case "secundaria": return "qr_secundaria_url";
    case "adulto_mayor":
    case "discapacidad": return "qr_adulto_url";
    default: return "qr_general_url";
  }
}
