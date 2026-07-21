import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { signUpAutoConfirm, generateDriverCode } from "@/lib/auth.functions";
import { uploadImage, makeSampleImage } from "@/lib/image";
import { FilePick } from "./PassengerRegister";

type State = {
  phone: string; password: string; email: string;
  first_name: string; paternal_surname: string; maternal_surname: string;
  ci_number: string; birthdate: string;
  files: { ci_front?: Blob; ci_back?: Blob; selfie?: Blob; license?: Blob;
           qr_general?: Blob; qr_primaria?: Blob; qr_secundaria?: Blob; qr_adulto?: Blob };
};

const initial: State = {
  phone: "", password: "", email: "",
  first_name: "", paternal_surname: "", maternal_surname: "", ci_number: "", birthdate: "",
  files: {},
};

export function DriverRegister() {
  const [s, setS] = useState<State>(initial);
  const [busy, setBusy] = useState(false);

  function autofill() {
    setS({
      phone: "7" + Math.floor(1000000 + Math.random() * 8999999),
      password: "Password123!",
      email: `drv${Date.now()}@pagojusto.bo`,
      first_name: "Pedro",
      paternal_surname: "Choque",
      maternal_surname: "Villca",
      ci_number: "" + Math.floor(1000000 + Math.random() * 8999999),
      birthdate: "1980-03-22",
      files: {
        ci_front: makeSampleImage("CI Frontal"),
        ci_back: makeSampleImage("CI Reverso"),
        selfie: makeSampleImage("Selfie con CI", "#0891b2"),
        license: makeSampleImage("Licencia", "#4d7c0f"),
        qr_general: makeSampleImage("QR General Bs 3", "#111827"),
        qr_primaria: makeSampleImage("QR Primaria Bs 1", "#111827"),
        qr_secundaria: makeSampleImage("QR Secundaria Bs 2", "#111827"),
        qr_adulto: makeSampleImage("QR Adulto Bs 2.5", "#111827"),
      },
    });
    toast.success("Datos de prueba cargados (Contraseña: Password123!)");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const need: (keyof State["files"])[] = ["ci_front","ci_back","selfie","license","qr_general","qr_primaria","qr_secundaria","qr_adulto"];
    for (const k of need) if (!s.files[k]) return toast.error(`Falta ${k}`);
    if (!s.phone || !s.password || !s.first_name || !s.ci_number || !s.birthdate) return toast.error("Completa todos los datos");
    setBusy(true);
    try {
      const email = s.email || `${s.phone}@pagojusto.bo`;
      const { userId } = await signUpAutoConfirm({ data: { email, password: s.password, phone: s.phone } });
      const { error } = await supabase.auth.signInWithPassword({ email, password: s.password });
      if (error) throw error;
      const { code } = await generateDriverCode();

      const up = async (bucket: string, name: string, blob: Blob) =>
        await uploadImage(supabase, bucket, `${userId}/${name}.jpg`, blob);

      const urls: Record<string, string> = {};
      urls.ci_front_url = await up("kyc-documents", "ci_front", s.files.ci_front!);
      urls.ci_back_url = await up("kyc-documents", "ci_back", s.files.ci_back!);
      urls.selfie_url = await up("kyc-documents", "selfie", s.files.selfie!);
      urls.license_url = await up("kyc-documents", "license", s.files.license!);
      urls.qr_general_url = await up("qr-codes", "qr_general", s.files.qr_general!);
      urls.qr_primaria_url = await up("qr-codes", "qr_primaria", s.files.qr_primaria!);
      urls.qr_secundaria_url = await up("qr-codes", "qr_secundaria", s.files.qr_secundaria!);
      urls.qr_adulto_url = await up("qr-codes", "qr_adulto", s.files.qr_adulto!);

      const { error: pErr } = await supabase.from("profiles").insert({
        id: userId, role: "driver", status: "pending",
        first_name: s.first_name, paternal_surname: s.paternal_surname, maternal_surname: s.maternal_surname,
        ci_number: s.ci_number, birthdate: s.birthdate, phone: s.phone, email,
        driver_code: code, ...urls,
      });
      if (pErr) throw pErr;
      await supabase.from("user_roles").insert({ user_id: userId, role: "driver" });
      toast.success(`Registrado. Tu código de chofer: ${code}. Cuenta pendiente de aprobación.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Button type="button" variant="outline" onClick={autofill} className="w-full border-primary text-primary">
        <Sparkles className="w-4 h-4 mr-2" /> Cargar Datos de Prueba
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Teléfono *</Label><Input value={s.phone} onChange={(e) => setS({...s, phone: e.target.value})} /></div>
        <div><Label>Contraseña *</Label><Input type="password" value={s.password} onChange={(e) => setS({...s, password: e.target.value})} /></div>
        <div className="col-span-2"><Label>Email (opcional)</Label><Input type="email" value={s.email} onChange={(e) => setS({...s, email: e.target.value})} /></div>
        <div><Label>Nombres *</Label><Input value={s.first_name} onChange={(e) => setS({...s, first_name: e.target.value})} /></div>
        <div><Label>Ap. Paterno *</Label><Input value={s.paternal_surname} onChange={(e) => setS({...s, paternal_surname: e.target.value})} /></div>
        <div><Label>Ap. Materno</Label><Input value={s.maternal_surname} onChange={(e) => setS({...s, maternal_surname: e.target.value})} /></div>
        <div><Label>CI *</Label><Input value={s.ci_number} onChange={(e) => setS({...s, ci_number: e.target.value})} /></div>
        <div className="col-span-2"><Label>Fecha de nacimiento *</Label><Input type="date" value={s.birthdate} onChange={(e) => setS({...s, birthdate: e.target.value})} /></div>
      </div>
      <div className="pt-2 space-y-2">
        <h4 className="font-semibold text-sm">Documentos KYC</h4>
        <FilePick label="CI Frontal *" file={s.files.ci_front} onFile={(f) => setS({...s, files: {...s.files, ci_front: f}})} />
        <FilePick label="CI Reverso *" file={s.files.ci_back} onFile={(f) => setS({...s, files: {...s.files, ci_back: f}})} />
        <FilePick label="Selfie con CI *" file={s.files.selfie} onFile={(f) => setS({...s, files: {...s.files, selfie: f}})} />
        <FilePick label="Licencia de Conducir *" file={s.files.license} onFile={(f) => setS({...s, files: {...s.files, license: f}})} />
      </div>
      <div className="pt-2 space-y-2">
        <h4 className="font-semibold text-sm">Códigos QR bancarios (4)</h4>
        <FilePick label="QR General (Bs 3.00) *" file={s.files.qr_general} onFile={(f) => setS({...s, files: {...s.files, qr_general: f}})} />
        <FilePick label="QR Primaria (Bs 1.00) *" file={s.files.qr_primaria} onFile={(f) => setS({...s, files: {...s.files, qr_primaria: f}})} />
        <FilePick label="QR Secundaria/Universitario (Bs 2.00) *" file={s.files.qr_secundaria} onFile={(f) => setS({...s, files: {...s.files, qr_secundaria: f}})} />
        <FilePick label="QR Adulto Mayor/Discapacidad (Bs 2.50) *" file={s.files.qr_adulto} onFile={(f) => setS({...s, files: {...s.files, qr_adulto: f}})} />
      </div>
      <Button type="submit" disabled={busy} className="w-full">
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Registrarme como Chofer
      </Button>
    </form>
  );
}
