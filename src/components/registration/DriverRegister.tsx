import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { generateDriverCode } from "@/lib/auth.functions";
import { uploadImage, makeSampleImage } from "@/lib/image";
import { cleanAccount, formatAccount, createAccount } from "@/lib/bank";
import { useBancos, useLineasTransporte } from "@/lib/catalogs";
import { Captcha } from "@/components/Captcha";
import { FilePick } from "./PassengerRegister";

type State = {
  phone: string; password: string; email: string;
  first_name: string; paternal_surname: string; maternal_surname: string;
  ci_number: string; birthdate: string; bank_account: string; bank_name: string;
  transport_line: string;
  files: { ci_front?: Blob; ci_back?: Blob; selfie?: Blob; license?: Blob; union_doc?: Blob };
};

const initial: State = {
  phone: "", password: "", email: "",
  first_name: "", paternal_surname: "", maternal_surname: "", ci_number: "", birthdate: "",
  bank_account: "", bank_name: "", transport_line: "",
  files: {},
};

export function DriverRegister() {
  const [s, setS] = useState<State>(initial);
  const [busy, setBusy] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);
  const { bancos, error: bancosError, validarCuenta } = useBancos();
  const { lineas, error: lineasError } = useLineasTransporte();

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
      bank_account: `${Math.floor(100000 + Math.random() * 899999)}`,
      bank_name: bancos[0]?.nombre ?? "",
      transport_line: lineas[0]?.nombre ?? "",
      files: {
        ci_front: makeSampleImage("CI Frontal"),
        ci_back: makeSampleImage("CI Reverso"),
        selfie: makeSampleImage("Selfie con CI", "#0891b2"),
        license: makeSampleImage("Licencia", "#4d7c0f"),
        union_doc: makeSampleImage("Credencial de Línea", "#b45309"),
      },
    });
    toast.success("Datos de prueba cargados (Contraseña: Password123!)");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const need: { key: keyof State["files"]; label: string }[] = [
      { key: "ci_front", label: "la foto del CI frontal" },
      { key: "ci_back", label: "la foto del CI reverso" },
      { key: "selfie", label: "la selfie con el CI" },
      { key: "license", label: "la licencia de conducir" },
      { key: "union_doc", label: "la credencial de línea / carnet de sindicato" },
    ];
    for (const n of need) if (!s.files[n.key]) return toast.error(`Falta ${n.label}`);
    if (!s.phone || !s.password || !s.first_name || !s.ci_number || !s.birthdate) return toast.error("Completa todos los datos");
    if (!s.transport_line) return toast.error("Selecciona tu línea de micro / transporte");
    if (!s.bank_name) return toast.error("Selecciona tu banco");
    const cuenta = cleanAccount(s.bank_account);
    if (!cuenta) return toast.error("Ingresa tu número de cuenta (solo dígitos)");
    const cuentaErr = validarCuenta(s.bank_name, cuenta);
    if (cuentaErr) return toast.error(cuentaErr);
    if (!captchaOk) return toast.error("Completa la verificación humana");
    setBusy(true);
    try {
      const email = s.email || `${s.phone}@pagojusto.bo`;

      // 1) Crear el usuario de autenticación
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email,
        password: s.password,
        options: { emailRedirectTo: window.location.origin, data: { phone: s.phone } },
      });
      if (signUpErr) {
        throw new Error(
          /already/i.test(signUpErr.message)
            ? "Ese correo o teléfono ya está registrado. Inicia sesión."
            : signUpErr.message,
        );
      }

      // 2) Asegurar sesión activa para subir documentos e insertar el perfil
      let userId = signUpData.user?.id ?? null;
      if (!signUpData.session) {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password: s.password });
        if (error) throw new Error(`Cuenta creada, pero no se pudo iniciar sesión: ${error.message}`);
        userId = signInData.user?.id ?? userId;
      }
      if (!userId) throw new Error("No se pudo obtener el usuario creado");

      const { code } = await generateDriverCode();

      const up = async (bucket: string, name: string, blob: Blob) =>
        await uploadImage(supabase, bucket, `${userId}/${name}.jpg`, blob);

      const urls: Record<string, string> = {};
      urls.ci_front_url = await up("kyc-documents", "ci_front", s.files.ci_front!);
      urls.ci_back_url = await up("kyc-documents", "ci_back", s.files.ci_back!);
      urls.selfie_url = await up("kyc-documents", "selfie", s.files.selfie!);
      urls.license_url = await up("kyc-documents", "license", s.files.license!);
      urls.union_doc_url = await up("kyc-documents", "union_doc", s.files.union_doc!);

      // 3) Insertar el perfil completo (ya no hay trigger que lo cree)
      const { error: pErr } = await supabase.from("profiles").upsert({
        id: userId, role: "driver", status: "pending",
        first_name: s.first_name, paternal_surname: s.paternal_surname, maternal_surname: s.maternal_surname,
        ci_number: s.ci_number, birthdate: s.birthdate, phone: s.phone, email,
        bank_account: cuenta, bank_name: s.bank_name, transport_line: s.transport_line,
        driver_code: code, ...urls,
      }, { onConflict: "id" });
      if (pErr) throw new Error(`No se pudo crear el perfil del chofer: ${pErr.message}`);
      const { error: rErr } = await supabase.from("user_roles").insert({ user_id: userId, role: "driver" });
      if (rErr) toast.warning(`Perfil creado, pero el rol no se registró: ${rErr.message}`);

      try {
        await createAccount(cuenta, `${s.first_name} ${s.paternal_surname}`.trim(), s.bank_name);
      } catch {
        /* la cuenta ya podría existir en el banco */
      }

      toast.success(`Registrado. Código de chofer: ${code} · ${formatAccount(s.bank_name, cuenta)}. Pendiente de aprobación.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de red o registro. Intenta nuevamente.");
    } finally { setBusy(false); }
  }


  return (
    <form onSubmit={submit} className="space-y-3">
      {(bancosError || lineasError) && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          No se pudieron cargar los bancos o las líneas de transporte. Intenta nuevamente más tarde.
        </div>
      )}
      <Button type="button" variant="outline" onClick={autofill} className="w-full border-primary text-primary">
        <Sparkles className="w-4 h-4 mr-2" /> Cargar Datos de Prueba
      </Button>
      <p className="text-xs text-muted-foreground text-center -mt-2">(Contraseña: Password123!)</p>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Teléfono *</Label><Input value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} /></div>
        <div><Label>Contraseña *</Label><Input type="password" value={s.password} onChange={(e) => setS({ ...s, password: e.target.value })} /></div>
        <div className="col-span-2"><Label>Correo electrónico (opcional)</Label><Input type="email" value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} /></div>
        <div><Label>Nombres *</Label><Input value={s.first_name} onChange={(e) => setS({ ...s, first_name: e.target.value })} /></div>
        <div><Label>Ap. Paterno *</Label><Input value={s.paternal_surname} onChange={(e) => setS({ ...s, paternal_surname: e.target.value })} /></div>
        <div><Label>Ap. Materno</Label><Input value={s.maternal_surname} onChange={(e) => setS({ ...s, maternal_surname: e.target.value })} /></div>
        <div><Label>CI *</Label><Input value={s.ci_number} onChange={(e) => setS({ ...s, ci_number: e.target.value })} /></div>
        <div className="col-span-2"><Label>Fecha de nacimiento *</Label><Input type="date" value={s.birthdate} onChange={(e) => setS({ ...s, birthdate: e.target.value })} /></div>
        <div className="col-span-2">
          <Label>Línea de micro / transporte *</Label>
          <Select value={s.transport_line} onValueChange={(v) => setS({ ...s, transport_line: v })}>
            <SelectTrigger><SelectValue placeholder="Selecciona tu línea" /></SelectTrigger>
            <SelectContent>
              {lineas.map((l) => <SelectItem key={l.id} value={l.nombre}>{l.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label>Banco *</Label>
          <Select value={s.bank_name} onValueChange={(v) => setS({ ...s, bank_name: v })}>
            <SelectTrigger><SelectValue placeholder="Selecciona tu banco" /></SelectTrigger>
            <SelectContent>
              {bancos.map((b) => <SelectItem key={b.id} value={b.nombre}>{b.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label>Número de cuenta *</Label>
          <Input
            inputMode="numeric"
            value={s.bank_account}
            onChange={(e) => setS({ ...s, bank_account: cleanAccount(e.target.value) })}
            placeholder="Ej. 104578"
          />
          <p className="text-xs text-muted-foreground mt-1">{formatAccount(s.bank_name, s.bank_account)}</p>
        </div>
      </div>
      <div className="pt-2 space-y-2">
        <h4 className="font-semibold text-sm">Documentos de verificación de identidad</h4>
        <FilePick label="CI Frontal *" file={s.files.ci_front} onFile={(f) => setS({ ...s, files: { ...s.files, ci_front: f } })} />
        <FilePick label="CI Reverso *" file={s.files.ci_back} onFile={(f) => setS({ ...s, files: { ...s.files, ci_back: f } })} />
        <FilePick label="Selfie con CI *" file={s.files.selfie} onFile={(f) => setS({ ...s, files: { ...s.files, selfie: f } })} />
        <FilePick label="Licencia de Conducir *" file={s.files.license} onFile={(f) => setS({ ...s, files: { ...s.files, license: f } })} />
        <FilePick label="Credencial de Línea / Carnet de Sindicato *" file={s.files.union_doc} onFile={(f) => setS({ ...s, files: { ...s.files, union_doc: f } })} />
      </div>
      <Captcha verified={captchaOk} onVerify={setCaptchaOk} />
      <Button type="submit" disabled={busy} className="w-full">
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Registrarme como Chofer
      </Button>
    </form>
  );
}
