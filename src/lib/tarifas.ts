import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Category } from "./categories";

export type Tarifa = { id: string; tipo: string; nombre: string; precio: number };

/**
 * Equivalencia entre el valor del enum `fare_category` guardado en `profiles`
 * y el `tipo` de la fila correspondiente en `public.tarifas`.
 * No define tarifas: solo enlaza cada categoría con su fila en la base de datos.
 */
export const CATEGORY_TIPO: Record<Category, string> = {
  general: "general",
  primaria: "estudiante",
  secundaria: "universitario",
  adulto_mayor: "adulto_mayor",
  discapacidad: "discapacidad",
};

export function tipoForCategory(c: Category | string | null | undefined): string {
  const key = (c ?? "general") as Category;
  return CATEGORY_TIPO[key] ?? String(c ?? "general");
}

export type MapaTarifas = Record<string, Tarifa>;

let cache: { list: Tarifa[]; byTipo: MapaTarifas } | null = null;
let inflight: Promise<{ list: Tarifa[]; byTipo: MapaTarifas }> | null = null;

/** Lee las tarifas vigentes desde `public.tarifas` (única fuente de verdad). */
export async function fetchTarifas(force = false) {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase.from("tarifas").select("id, tipo, nombre, precio").order("precio");
    if (error) { inflight = null; throw error; }
    const list: Tarifa[] = (data ?? []).map((t) => ({
      id: String(t.id), tipo: t.tipo, nombre: t.nombre, precio: Number(t.precio),
    }));
    const byTipo: MapaTarifas = {};
    for (const t of list) byTipo[t.tipo] = t;
    cache = { list, byTipo };
    inflight = null;
    return cache;
  })();
  return inflight;
}

/** Hook con las tarifas vigentes leídas desde la base de datos. */
export function useTarifas() {
  const [list, setList] = useState<Tarifa[]>(cache?.list ?? []);
  const [byTipo, setByTipo] = useState<MapaTarifas>(cache?.byTipo ?? {});
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchTarifas()
      .then((m) => { if (alive) { setList(m.list); setByTipo(m.byTipo); setLoading(false); } })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "No se pudieron cargar las tarifas");
        setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const tarifaFor = (c: Category | string | null | undefined): Tarifa | undefined => byTipo[tipoForCategory(c)];
  const precio = (c: Category | string | null | undefined): number => Number(tarifaFor(c)?.precio ?? 0);
  const nombre = (c: Category | string | null | undefined): string => tarifaFor(c)?.nombre ?? String(c ?? "—");

  return { tarifas: list, byTipo, tarifaFor, precio, nombre, loading, error };
}
