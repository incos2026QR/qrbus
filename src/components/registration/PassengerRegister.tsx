import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Sparkles, Upload, Check } from "lucide-react";
import { signUpAutoConfirm } from "@/lib/auth.functions";
import { uploadImage, makeSampleImage } from "@/lib/image";
import { CATEGORIES, computeAge, validateCategoryForAge, type Category } from "@/lib/categories";

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
  category: Category;
  files: {
    ci_front?: Blob;
    ci_back?: Blob;
    selfie?: Blob;
    extra?: Blob;
  };
};

const initial: FormState = {
  step: 1, phone: "", password: "", email: "",
  first_name: "", paternal_surname: "", maternal_surname: "", ci_number: "", birthdate: "",
  category: "general", files: {},
};

export function PassengerRegister() {
  const [s, setS] = useState<FormState>(initial);
  const [busy, setBusy] = useState(false);

  function autofill() {
    setS((p) => ({
      ...p,
      phone: "7" + Math.floor(1000000 + Math.random() * 8999999),
      password: "Passenger123!",
      email: `demo${Date.now()}@pagojusto.bo`,
      first_name: "Juan Carlos",
      paternal_surname: "Mamani",
      maternal_surname: "Quispe",
      ci_number: "" + Math.floor(1000000 + Math.random() * 8999999),
      birthdate: "1995-06-15",
      category: "general",
      files: {
        ci_front: makeSampleImage("CI Frontal"),
        ci_back: makeSampleImage("CI Reverso"),
        selfie: makeSampleImage("Selfie con CI", "#0891b2"),
      },
    }));
    toast.success("Datos de prueba cargados");
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
    const err = validateCategoryForAge(s.category, age);
    if (err) return toast.error(err);
    const cat = CATEGORIES.find((c) => c.value === s.category)!;
    if (cat.requiresExtraDoc?.(age) && !s.files.extra) {
      return toast.error(`Sube ${cat.extraDocLabel}`);
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
      if (s.files.extra) {
        uploads.extra_doc_url = await uploadImage(supabase, "kyc-documents", `${userId}/extra.jpg`, s.files.extra);
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
        category: s.category,
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
    <div className="space-y-4">
      <Button type="button" variant="outline" onClick={autofill} className="w-full border-primary text-primary">
        <Sparkles className="w-4 h-4 mr-2" /> Cargar Datos de Prueba
      </Button>
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
  const cat = CATEGORIES.find((c) => c.value === s.category)!;
  const err = s.birthdate ? validateCategoryForAge(s.category, age) : null;
  const needsExtra = s.birthdate && cat.requiresExtraDoc?.(age);
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Paso 4: Categoría de tarifa</h3>
      <p className="text-xs text-muted-foreground">Edad calculada: <strong>{age}</strong> años</p>
      <Select value={s.category} onValueChange={(v) => setS({...s, category: v as Category})}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((c) => (
            <SelectItem key={c.value} value={c.value}>{c.label} — Bs {c.price.toFixed(2)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {needsExtra && (
        <FilePick label={`${cat.extraDocLabel} *`} file={s.files.extra} onFile={(f) => setS({...s, files: {...s.files, extra: f}})} />
      )}
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
