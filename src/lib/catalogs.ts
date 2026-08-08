import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LineaTransporte = { id: string; nombre: string };
export type Banco = {
  id: string;
  nombre: string;
  codigo_banco: string | null;
  cuenta_min?: number | null;
  cuenta_max?: number | null;
};

/** Líneas de micro / transporte activas leídas desde `public.lineas_transporte`. */
export function useLineasTransporte() {
  const [lineas, setLineas] = useState<LineaTransporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("lineas_transporte")
      .select("id, nombre, activa")
      .order("nombre")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setError(error.message);
        else {
          setLineas(
            (data ?? [])
              .filter((l: { activa?: boolean | null }) => l.activa !== false)
              .map((l: { id: string; nombre: string }) => ({ id: String(l.id), nombre: l.nombre })),
          );
        }
        setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  return { lineas, loading, error };
}

/** Bancos disponibles leídos desde `public.bancos`. */
export function useBancos() {
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("bancos")
      .select("*")
      .order("nombre")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setError(error.message);
        else setBancos((data ?? []) as unknown as Banco[]);
        setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  /** Valida el largo de cuenta si el banco define mínimo/máximo en la base de datos. */
  const validarCuenta = (nombreBanco: string, cuenta: string): string | null => {
    const b = bancos.find((x) => x.nombre === nombreBanco);
    if (!b) return null;
    const n = cuenta.length;
    if (b.cuenta_min != null && n < b.cuenta_min) return `La cuenta de ${b.nombre} debe tener al menos ${b.cuenta_min} dígitos`;
    if (b.cuenta_max != null && n > b.cuenta_max) return `La cuenta de ${b.nombre} debe tener como máximo ${b.cuenta_max} dígitos`;
    return null;
  };

  return { bancos, loading, error, validarCuenta };
}
