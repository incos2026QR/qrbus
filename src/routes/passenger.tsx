import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { getSignedUrl } from "@/lib/image";
import { qrColumnFor, CATEGORIES } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogOut, Paperclip, Check, Loader2 } from "lucide-react";

export const Route = createFileRoute("/passenger")({ ssr: false, component: PassengerPage });

type DriverInfo = {
  id: string; driver_code: string; first_name: string | null; paternal_surname: string | null;
  qr_general_url: string | null; qr_primaria_url: string | null; qr_secundaria_url: string | null; qr_adulto_url: string | null;
};

function PassengerPage() {
  const { profile, userId, loading } = useSession();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [comprobante, setComprobante] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pass, setPass] = useState<{ vcode: string; selfieUrl: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!profile || !userId) navigate({ to: "/" });
    else if (profile.role !== "passenger") navigate({ to: "/" });
  }, [loading, profile, userId, navigate]);

  async function findDriver() {
    setPass(null); setQrUrl(null); setComprobante(false);
    if (code.length < 3) return toast.error("Ingresa el código del chofer");
    const { data } = await supabase.from("profiles").select("id, driver_code, first_name, paternal_surname, qr_general_url, qr_primaria_url, qr_secundaria_url, qr_adulto_url")
      .eq("driver_code", code.toUpperCase()).eq("role", "driver").eq("status", "active").maybeSingle();
    if (!data) return toast.error("Chofer no encontrado o no activo");
    setDriver(data as DriverInfo);
    if (!profile?.category) return toast.error("Tu categoría no está definida");
    const col = qrColumnFor(profile.category);
    const path = (data as DriverInfo)[col];
    if (!path) return toast.error("El chofer no tiene QR para tu categoría");
    setQrUrl(await getSignedUrl(supabase, "qr-codes", path));
  }

  function simulateUpload() {
    setUploading(true);
    setTimeout(() => { setUploading(false); setComprobante(true); toast.success("Comprobante adjuntado correctamente ✓"); }, 900);
  }

  async function confirmPayment() {
    if (!driver || !profile || !userId) return;
    setBusy(true);
    try {
      const category = profile.category!;
      const cat = CATEGORIES.find((c) => c.value === category)!;
      const vcode = Math.floor(10000 + Math.random() * 89999).toString();
      const { error } = await supabase.from("transactions").insert({
        driver_id: driver.id, passenger_id: userId, category, amount: cat.price, verification_code: vcode,
      });
      if (error) throw error;
      const selfie = profile.selfie_url ? await getSignedUrl(supabase, "kyc-documents", profile.selfie_url) : null;
      setPass({ vcode, selfieUrl: selfie });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  }

  if (loading || !profile) return <div className="p-8">Cargando...</div>;

  if (profile.status !== "active") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="p-6 max-w-md text-center">
          <h2 className="text-xl font-bold">Cuenta {profile.status}</h2>
          <p className="text-sm text-muted-foreground mt-2">Tu cuenta debe ser aprobada por un supervisor antes de usar el servicio.</p>
          <Button className="mt-4" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>
            <LogOut className="w-4 h-4 mr-2" /> Cerrar sesión
          </Button>
        </Card>
      </div>
    );
  }

  if (pass) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-sm w-full">
          <p className="text-sm text-muted-foreground uppercase tracking-widest">Código de Validación</p>
          <div className="text-7xl font-black text-success my-4 tracking-widest tabular-nums">{pass.vcode}</div>
          {pass.selfieUrl && (
            <img src={pass.selfieUrl} alt="Selfie" className="w-40 h-40 object-cover rounded-full mx-auto border-4 border-primary shadow-lg" />
          )}
          <p className="mt-4 text-sm text-muted-foreground">Muestra este código al chofer para validar el pago.</p>
          <Button className="mt-6 w-full" variant="outline" onClick={() => { setPass(null); setDriver(null); setCode(""); }}>Nueva validación</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-md mx-auto">
      <header className="flex items-center justify-between py-3">
        <div>
          <h1 className="font-bold text-lg">Hola, {profile.first_name}</h1>
          <p className="text-xs text-muted-foreground">Pasajero activo</p>
        </div>
        <Button size="sm" variant="ghost" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>
          <LogOut className="w-4 h-4" />
        </Button>
      </header>

      <Card className="p-5 space-y-4">
        <div>
          <Label>Código del chofer (5 caracteres)</Label>
          <div className="flex gap-2 mt-1">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="DRV84" className="text-center text-2xl font-bold tracking-widest uppercase" />
            <Button onClick={findDriver}>Buscar</Button>
          </div>
        </div>

        {driver && qrUrl && (
          <div className="space-y-3 pt-2 border-t">
            <p className="text-sm">Chofer: <strong>{driver.first_name} {driver.paternal_surname}</strong></p>
            <div className="bg-white p-4 rounded-lg border">
              <img src={qrUrl} alt="QR Pago" className="w-full max-w-xs mx-auto" />
              <p className="text-center text-xs text-muted-foreground mt-2">Escanea con tu app bancaria</p>
            </div>
            <Button variant="outline" className="w-full" onClick={simulateUpload} disabled={uploading || comprobante}>
              {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Subiendo...</> :
               comprobante ? <><Check className="w-4 h-4 mr-2 text-success" /> Comprobante adjuntado ✓</> :
               <><Paperclip className="w-4 h-4 mr-2" /> Adjuntar comprobante de pago (Opcional)</>}
            </Button>
            <Button onClick={confirmPayment} disabled={busy} className="w-full h-12 text-base">
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar Pago Realizado
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
