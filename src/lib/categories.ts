export type Category = "general" | "primaria" | "secundaria" | "adulto_mayor" | "discapacidad";

export const CATEGORY_LABELS: Record<Category, string> = {
  general: "General",
  primaria: "Escolar",
  secundaria: "Universitario",
  adulto_mayor: "Adulto Mayor",
  discapacidad: "Persona con Discapacidad",
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export function computeAge(birthdate: string): number {
  const b = new Date(birthdate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/**
 * Selección inteligente por edad.
 *  - forced: la categoría queda fija según la edad (sin elección del usuario)
 *  - options: categorías permitidas (la discapacidad se maneja aparte)
 *  - requiresUniversityDoc: si elige "secundaria" debe subir carnet estudiantil
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
 * Resuelve la categoría final considerando discapacidad.
 * Siempre asigna la tarifa más baja disponible; los precios llegan desde la
 * tabla `tarifas` de la base de datos.
 */
export function resolveCategory(
  age: number,
  chosen: Category,
  hasDisability: boolean,
  precio: (c: Category) => number,
): Category {
  const bucket = ageBucket(age);
  const base: Category = bucket.forced ?? chosen ?? bucket.options[0]!;
  if (!hasDisability) return base;
  return precio(base) <= precio("discapacidad") ? base : "discapacidad";
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

export function validateCategoryForAge(category: Category, age: number): string | null {
  if (category === "primaria" && age > 17) return "Escolar solo hasta 17 años";
  if (category === "adulto_mayor" && age < 60) return "Adulto Mayor requiere 60+";
  if (category === "secundaria" && (age < 18 || age > 27)) return "Universitario entre 18 y 27";
  return null;
}

/** Etiquetas de estado de cuenta en español. */
export const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente de aprobación",
  active: "Activo",
  rejected: "Rechazado",
  suspended: "Suspendido",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  driver: "Chofer",
  passenger: "Pasajero",
};
