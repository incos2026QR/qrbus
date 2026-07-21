export type Category = "general" | "primaria" | "secundaria" | "adulto_mayor" | "discapacidad";

export const CATEGORY_LABELS: Record<Category, string> = {
  general: "General",
  primaria: "Estudiantil (Escolar)",
  secundaria: "Estudiante Universitario",
  adulto_mayor: "Adulto Mayor",
  discapacidad: "Persona con Discapacidad",
};

export const CATEGORY_PRICES: Record<Category, number> = {
  general: 3.0,
  primaria: 1.0,
  secundaria: 2.0,
  adulto_mayor: 2.5,
  discapacidad: 2.5,
};

// Legacy shape kept for admin overrides / display
export const CATEGORIES: {
  value: Category;
  label: string;
  price: number;
  requiresExtraDoc?: (age: number) => boolean;
  extraDocLabel?: string;
}[] = (Object.keys(CATEGORY_LABELS) as Category[]).map((v) => ({
  value: v,
  label: CATEGORY_LABELS[v],
  price: CATEGORY_PRICES[v],
  requiresExtraDoc:
    v === "secundaria" ? (age: number) => age >= 18 :
    v === "discapacidad" ? () => true : undefined,
  extraDocLabel:
    v === "secundaria" ? "Carnet Universitario/Estudiantil" :
    v === "discapacidad" ? "Carnet de Discapacidad" : undefined,
}));

export function computeAge(birthdate: string): number {
  const b = new Date(birthdate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/**
 * Smart selection by age. Returns:
 *  - forced: category is fixed by age (no user choice)
 *  - options: allowed categories (excluding disability, handled separately)
 *  - requiresUniversityDoc: if user picks "secundaria" in 18-27, they must upload student ID
 */
export function ageBucket(age: number): {
  forced?: Category;
  options: Category[];
  requiresUniversityDoc?: boolean;
} {
  if (age < 18) return { forced: "primaria", options: ["primaria"] };
  if (age >= 60) return { forced: "adulto_mayor", options: ["adulto_mayor"] };
  if (age <= 27) return { options: ["secundaria", "general"], requiresUniversityDoc: true };
  return { options: ["general"] };
}

/**
 * Resolve final category considering disability. Always picks the cheapest fare.
 */
export function resolveCategory(age: number, chosen: Category, hasDisability: boolean): Category {
  const bucket = ageBucket(age);
  const base: Category = bucket.forced ?? chosen ?? bucket.options[0];
  if (!hasDisability) return base;
  // Compare base fare vs discapacidad (2.5) and pick the cheapest for passenger.
  return CATEGORY_PRICES[base] <= CATEGORY_PRICES.discapacidad ? base : "discapacidad";
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

// Kept for backward compatibility with the admin override select
export function validateCategoryForAge(category: Category, age: number): string | null {
  if (category === "primaria" && age > 17) return "Estudiantil solo hasta 17 años";
  if (category === "adulto_mayor" && age < 60) return "Adulto Mayor requiere 60+";
  if (category === "secundaria" && (age < 18 || age > 27)) return "Universitario entre 18 y 27";
  return null;
}
