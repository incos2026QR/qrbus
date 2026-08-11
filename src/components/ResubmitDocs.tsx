import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { uploadImage } from "@/lib/image";
import { FilePick } from "@/components/registration/PassengerRegister";

export type DocKey = "ci_front" | "ci_back" | "selfie" | "license" | "union_doc" | "extra_doc";

const DOC_LABELS: Record<DocKey, string> = {
  ci_front: "CI Frontal",
  ci_back: "CI Reverso",
  selfie: "Selfie con CI",
  license: "Licencia de Conducir",
  union_doc: "Credencial de Línea / Carnet de Sindicato",
  extra_doc: "Documento adicional (carnet estudiantil / discapacidad)",
};

export const DRIVER_DOCS: DocKey[] = ["ci_front", "ci_back", "selfie", "license", "union_doc"];
export const PASSENGER_DOCS: DocKey[] = ["ci_front", "ci_back", "selfie", "extra_doc"];

const MAX_RESUBMISSIONS = 3;

/**
 * Muestra el motivo de rechazo y permite reenviar documentos corregidos
 * (máximo 3 intentos). Al reenviar, la cuenta vuelve a estado pendiente.
 */
export function ResubmitDocs({
  profile,
  docs,
  onDone,
}: {
  profile: { id: string; resubmission_count: number | null; rejection_reason: string | null };
  docs: DocKey[];
  onDone: () => void;
}) {
  const [files, setFiles] = useState<Partial<Record<DocKey, Blob>>>({});
  const [busy, setBusy] = useState(false);
  const attempts = Number(profile.resubmission_count ?? 0);
  const remaining = Math.max(0, MAX_RESUBMISSIONS - attempts);

  async function submit() {
    const entries = Object.entries(files) as [DocKey, Blob][];
    if (entries.length === 0) return toast.error("Sube al menos un documento corregido");
    if (remaining === 0) return toast.error(`Alcanzaste el límite de ${MAX_RESUBMISSIONS} reenvíos. Acércate a la oficina.`);
    setBusy(true);
    try {
      const updates: Record<string, unknown> = {
        status: "pending",
        rejection_reason: null,
        resubmission_count: attempts + 1,
      };
      for (const [key, blob] of entries) {
        const url = await uploadImage(supabase, "kyc-documents", `${profile.id}/${key}_r${attempts + 1}.jpg`, blob);
        updates[`${key}_url`] = url;
      }
      const { error } = await supabase.from("profiles").update(updates as never).eq("id", profile.id);
      if (error) throw error;
      toast.success("Documentos reenviados. Tu cuenta volvió a revisión.");
      setFiles({});
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al reenviar");
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-3 text-left">
      <div>
        <p className="text-sm font-semibold text-destructive">Motivo del rechazo</p>
        <p className="text-sm">{profile.rejection_reason ?? "El supervisor no registró un motivo."}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Reenvíos disponibles: <strong>{remaining}</strong> de {MAX_RESUBMISSIONS}
      </p>
      {remaining > 0 ? (
        <>
          {docs.map((k) => (
            <FilePick key={k} label={DOC_LABELS[k]} file={files[k]} onFile={(f) => setFiles((p) => ({ ...p, [k]: f }))} />
          ))}
          <Button className="w-full" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Reenviar para Aprobación
          </Button>
        </>
      ) : (
        <p className="text-sm text-destructive">
          Alcanzaste el límite de {MAX_RESUBMISSIONS} reenvíos. Acércate a la oficina para continuar el trámite.
        </p>
      )}
    </div>
  );
}
