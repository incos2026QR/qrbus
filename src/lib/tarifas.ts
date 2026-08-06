import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Category } from "./categories";

export type Tarifa = { tipo: string; nombre: string; precio: number };

/** Respaldo usado solo si la base de datos aún no responde. */
export const TARIFAS_RESPALDO: Record<Category, Tarifa> = {
  general: { tipo: "general", nombre: "General", precio: 2.0 },
  primaria: { tipo: "primaria", nombre: "Escolar", precio: 0.8 },
  secundaria: { tipo: "secundaria", nombre: "Universitario", precio: 1.0 },
  adulto_mayor: { tipo: "adulto_mayor", nombre: "Adulto Mayor", precio: 1.0 },
  discapacidad: { tipo: "discapacidad", nombre: "Persona con Discapacidad", precio: 1.0 },
};

export type MapaTarifas = Record<string, Tarifa>;

let cache: MapaTarifas | null = null;
let inflight: Promise<MapaTarifas> | null = null;

export async function fetchTarifas(force = false): Promise<MapaTarifas> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    const { data } = await supabase.from("tarifas").select("tipo, nombre, precio");
    const mapa: MapaTarifas = { ...TARIFAS_RESPALDO };
    for (const t of data ?? []) {
      mapa[t.tipo] = { tipo: t.tipo, nombre: t.nombre, precio: Number(t.precio) };
    }
    cache = mapa;
    inflight = null;
    return mapa;
  })();
  return inflight;
}

/** Hook con las tarifas vigentes leídas desde la base de datos. */
export function useTarifas() {
  const [tarifas, setTarifas] = useState<MapaTarifas>(cache ?? TARIFAS_RESPALDO);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;
    fetchTarifas()
      .then((m) => { if (alive) { setTarifas(m); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const precio = (c: Category | string | null | undefined) =>
    tarifas[(c ?? "general") as string]?.precio ?? TARIFAS_RESPALDO.general.precio;
  const nombre = (c: Category | string | null | undefined) =>
    tarifas[(c ?? "general") as string]?.nombre ?? TARIFAS_RESPALDO.general.nombre;

  return { tarifas, precio, nombre, loading };
}
