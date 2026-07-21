import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Sparkles, Upload, Check } from "lucide-react";
import { signUpAutoConfirm } from "@/lib/auth.functions";
import { uploadImage, makeSampleImage } from "@/lib/image";
import {
  CATEGORY_LABELS, CATEGORY_PRICES,
  computeAge, ageBucket, resolveCategory, type Category,
} from "@/lib/categories";

const DEMO_PASSWORD = "Password123!";

type FormState = {
  step: 1 | 2 | 3 | 4;
  phone: string;
  password: string;
  email: string;
  first_name: string;
  paternal_surname: string;
  maternal_surname: string;
  ci_number: string;
  birthdate: string;
  chosen: Category;
  hasDisability: boolean;
  files: {
    ci_front?: Blob;
    ci_back?: Blob;
    selfie?: Blob;
    university?: Blob;
    disability?: Blob;
  };
};

const initial: FormState = {
  step: 1, phone: "", password: "", email: "",
  first_name: "", paternal_surname: "", maternal_surname: "", ci_number: "", birthdate: "",
  chosen: "general", hasDisability: false, files: {},
};

export function PassengerRegister() {
  const [s, setS] = useState<FormState>(initial);
  const [busy, setBusy] = useState(false);

  function autofill() {
    setS((p) => ({
      ...p,
      phone: "7" + Math.floor(1000000 + Math.random() * 8999999),
      password: DEMO_PASSWORD,
      email: `demo${Date.now()}@pagojusto.bo`,
      first_name: "Juan Carlos",
      paternal_surname: "Mamani",
      maternal_surname: "Quispe",
      ci_number: "" + Math.floor(1000000 + Math.random() * 8999999),
      birthdate: "1995-06-15",
      chosen: "general",
      hasDisability: false,
      files: {
        ci_front: makeSampleImage("CI Frontal"),
        ci_back: makeSampleImage("CI Reverso"),
        selfie: makeSampleImage("Selfie con CI", "#0891b2"),
      },
    }));
    toast.success(`Datos de prueba cargados (Contraseña: ${DEMO_PASSWORD})`);
  }

  function next() {
    if (s.step === 1) {
      if (!s.phone || !s.password) return toast.error("Teléfono y contraseña requeridos");
    }
    if (s.step === 2) {
      if (!s.first_name || !s.paternal_surname || !s.ci_number || !s.birthdate)
        return toast.error("Completa todos los campos");
    }
    if (s.step === 3) {
      if (!s.files.ci_front || !s.files.ci_back || !s.files.selfie)
        return toast.error("Sube las 3 fotos requeridas");
    }
    setS((p) => ({ ...p, step: (p.step + 1) as FormState["step"] }));
  }

  async function submit() {
    const age = computeAge(s.birthdate);
    const bucket = ageBucket(age);
    const chosen = bucket.forced ?? s.chosen;
    const finalCategory = resolveCategory(age, chosen, s.hasDisability);

    if (bucket.requiresUniversityDoc && chosen === "secundaria" && !s.files.university) {
      return toast.error("Sube el Carnet Universitario/Estudiantil");
    }
    if (s.hasDisability && !s.files.disability) {
      return toast.error("Sube el Carnet de Discapacidad");
    }

    setBusy(true);
    try {
      const email = s.email || `${s.phone}@pagojusto.bo`;
      const { userId } = await signUpAutoConfirm({ data: { email, password: s.password, phone: s.phone } });
      const { error: signIn } = await supabase.auth.signInWithPassword({ email, password: s.password });
      if (signIn) throw signIn;

      const uploads: Record<string, string | null> = {};
      uploads.ci_front_url = await uploadImage(supabase, "kyc-documents", `${userId}/ci_front.jpg`, s.files.ci_front!);
      uploads.ci_back_url = await uploadImage(supabase, "kyc-documents", `${userId}/ci_back.jpg`, s.files.ci_back!);
      uploads.selfie_url = await uploadImage(supabase, "kyc-documents", `${userId}/selfie.jpg`, s.files.selfie!);
      // extra_doc_url stores the disability card if present; otherwise university ID.
      const extra = s.files.disability ?? s.files.university;
      if (extra) {
        uploads.extra_doc_url = await uploadImage(supabase, "kyc-documents", `${userId}/extra.jpg`, extra);
      }

      const { error: profErr } = await supabase.from("profiles").insert({
        id: userId,
        role: "passenger",
        status: "pending",
        first_name: s.first_name,
        paternal_surname: s.paternal_surname,
        maternal_surname: s.maternal_surname,
        ci_number: s.ci_number,
        birthdate: s.birthdate,
        phone: s.phone,
        email,
        category: finalCategory,
        ...uploads,
      });
      if (profErr) throw profErr;
      await supabase.from("user_roles").insert({ user_id: userId, role: "passenger" });
      toast.success("Registro exitoso. Cuenta pendiente de aprobación.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 max-w-full">
      <div>
        <Button type="button" variant="outline" onClick={autofill} className="w-full border-primary text-primary">
          <Sparkles className="w-4 h-4 mr-2" /> Cargar Datos de Prueba
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-1">(Contraseña: {DEMO_PASSWORD})</p>
      </div>
      <div className="flex gap-1">
        {[1,2,3,4].map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded ${s.step >= i ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      {s.step === 1 && (
        <div className="space-y-3">
          <h3 className="font-semibold">Paso 1: Credenciales</h3>
          <div><Label>Teléfono *</Label><Input value={s.phone} onChange={(e) => setS({...s, phone: e.target.value})} /></div>
          <div><Label>Contraseña *</Label><Input type="password" value={s.password} onChange={(e) => setS({...s, password: e.target.value})} /></div>
          <div><Label>Email (opcional)</Label><Input type="email" value={s.email} onChange={(e) => setS({...s, email: e.target.value})} /></div>
        </div>
      )}

      {s.step === 2 && (
        <div className="space-y-3">
          <h3 className="font-semibold">Paso 2: Datos personales</h3>
          <div><Label>Nombres *</Label><Input value={s.first_name} onChange={(e) => setS({...s, first_name: e.target.value})} /></div>
          <div><Label>Apellido Paterno *</Label><Input value={s.paternal_surname} onChange={(e) => setS({...s, paternal_surname: e.target.value})} /></div>
          <div><Label>Apellido Materno</Label><Input value={s.maternal_surname} onChange={(e) => setS({...s, maternal_surname: e.target.value})} /></div>
          <div><Label>CI *</Label><Input value={s.ci_number} onChange={(e) => setS({...s, ci_number: e.target.value})} /></div>
          <div><Label>Fecha de nacimiento *</Label><Input type="date" value={s.birthdate} onChange={(e) => setS({...s, birthdate: e.target.value})} /></div>
        </div>
      )}

      {s.step === 3 && (
        <div className="space-y-3">
          <h3 className="font-semibold">Paso 3: Documentos KYC</h3>
          <FilePick label="Foto CI Frontal *" file={s.files.ci_front} onFile={(f) => setS({...s, files: {...s.files, ci_front: f}})} />
          <FilePick label="Foto CI Reverso *" file={s.files.ci_back} onFile={(f) => setS({...s, files: {...s.files, ci_back: f}})} />
          <FilePick label="Selfie sosteniendo el CI *" file={s.files.selfie} onFile={(f) => setS({...s, files: {...s.files, selfie: f}})} />
        </div>
      )}

      {s.step === 4 && <Step4 s={s} setS={setS} />}

      <div className="flex gap-2 pt-2">
        {s.step > 1 && <Button type="button" variant="outline" onClick={() => setS({...s, step: (s.step - 1) as FormState["step"]})}>Atrás</Button>}
        {s.step < 4 && <Button type="button" onClick={next} className="ml-auto">Siguiente</Button>}
        {s.step === 4 && <Button type="button" onClick={submit} disabled={busy} className="ml-auto">
          {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Registrarme
        </Button>}
      </div>
    </div>
  );
}

function Step4({ s, setS }: { s: FormState; setS: (v: FormState) => void }) {
  const age = s.birthdate ? computeAge(s.birthdate) : 0;
  const bucket = ageBucket(age);
  const chosen = bucket.forced ?? s.chosen;
  const finalCategory = resolveCategory(age, chosen, s.hasDisability);

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Paso 4: Categoría de tarifa</h3>
      <p className="text-xs text-muted-foreground">Edad calculada: <strong>{age}</strong> años</p>

      {bucket.forced ? (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
          Asignación automática: <strong>{CATEGORY_LABELS[bucket.forced]}</strong> — Bs {CATEGORY_PRICES[bucket.forced].toFixed(2)}
        </div>
      ) : (
        <>
          <Label>Selecciona tu categoría</Label>
          <Select value={s.chosen} onValueChange={(v) => setS({...s, chosen: v as Category})}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {bucket.options.map((c) => (
                <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]} — Bs {CATEGORY_PRICES[c].toFixed(2)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bucket.requiresUniversityDoc && chosen === "secundaria" && (
            <FilePick label="Carnet Universitario/Estudiantil *"
              file={s.files.university}
              onFile={(f) => setS({...s, files: {...s.files, university: f}})} />
          )}
        </>
      )}

      <div className="flex items-center justify-between rounded-md border p-3 mt-2">
        <div>
          <Label>¿Tienes carnet de discapacidad?</Label>
          <p className="text-xs text-muted-foreground">Se aplicará automáticamente la tarifa más baja disponible.</p>
        </div>
        <Switch checked={s.hasDisability} onCheckedChange={(v) => setS({...s, hasDisability: v})} />
      </div>
      {s.hasDisability && (
        <FilePick label="Carnet de Discapacidad *"
          file={s.files.disability}
          onFile={(f) => setS({...s, files: {...s.files, disability: f}})} />
      )}

      <div className="rounded-md bg-accent/40 p-3 text-sm">
        Tarifa final asignada: <strong>{CATEGORY_LABELS[finalCategory]}</strong> — <strong>Bs {CATEGORY_PRICES[finalCategory].toFixed(2)}</strong>
      </div>
    </div>
  );
}

export function FilePick({ label, file, onFile }: { label: string; file?: Blob; onFile: (f: Blob) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <label className="mt-1 flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-input px-3 py-3 hover:bg-accent/40">
        {file ? <Check className="w-5 h-5 text-success" /> : <Upload className="w-5 h-5 text-muted-foreground" />}
        <span className="text-sm">{file ? "Adjuntada ✓" : "Seleccionar imagen"}</span>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
    </div>
  );
}
