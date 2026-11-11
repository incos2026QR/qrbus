import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { QrCode, Bus, UserPlus, LogIn, Loader2, Eye, EyeOff } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { PassengerRegister } from "@/components/registration/PassengerRegister";
import { DriverRegister } from "@/components/registration/DriverRegister";

export const Route = createFileRoute("/")({
  ssr: false,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { profile, userId, loading, missingProfile } = useSession();

  useEffect(() => {
    if (loading || !userId) return;
    if (missingProfile) {
      toast.error("Tu usuario no tiene un perfil registrado. Contacta al administrador.");
      supabase.auth.signOut();
      return;
    }
    if (!profile) return;

    if (profile.status === "suspended") {
      toast.error("Tu cuenta está suspendida. Contacta al administrador.");
      supabase.auth.signOut();
      return;
    }

    if (profile.role === "admin" || profile.role === "supervisor") navigate({ to: "/admin" });
    else if (profile.role === "driver") navigate({ to: "/driver" });
    else navigate({ to: "/passenger" });
  }, [loading, userId, profile, missingProfile, navigate]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-blue-light via-background to-brand-orange-light px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img
            src="/icons/pasaje_qr_512x512.png"
            alt="Icono de Pasaje QR"
            className="mx-auto mb-3 h-20 w-20 rounded-xl"
          />
          <div className="inline-flex items-center gap-2 rounded-2xl bg-brand-orange-light px-4 py-2">
            <QrCode className="w-6 h-6 text-brand-orange-dark" />
            <span className="font-bold text-brand-blue-dark">QR Pago Justo</span>
          </div>
          <h1 className="text-2xl font-bold mt-4 text-brand-ink">Transporte Público Cercado</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pago justo con validación instantánea
          </p>
        </div>

        <Card className="max-w-full overflow-hidden border-brand-blue/15 p-4 shadow-lg sm:p-6">
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-3 bg-brand-blue-light/70">
              <TabsTrigger
                value="login"
                className="text-brand-blue-dark data-[state=active]:bg-brand-blue data-[state=active]:text-white"
              >
                <LogIn className="w-4 h-4 mr-1" /> Ingresar
              </TabsTrigger>
              <TabsTrigger
                value="passenger"
                className="text-brand-blue-dark data-[state=active]:bg-brand-blue data-[state=active]:text-white"
              >
                <UserPlus className="w-4 h-4 mr-1" /> Pasajero
              </TabsTrigger>
              <TabsTrigger
                value="driver"
                className="text-brand-blue-dark data-[state=active]:bg-brand-blue data-[state=active]:text-white"
              >
                <Bus className="w-4 h-4 mr-1" /> Chofer
              </TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="mt-4">
              <LoginForm />
            </TabsContent>
            <TabsContent value="passenger" className="mt-4">
              <PassengerRegister />
            </TabsContent>
            <TabsContent value="driver" className="mt-4">
              <DriverRegister />
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </main>
  );
}

function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let email = identifier.trim();
      if (!email.includes("@")) {
        const { data, error } = await supabase.rpc("lookup_email_by_phone", { _phone: email });
        if (error) throw error;
        if (!data) throw new Error("Teléfono no registrado");
        email = data as string;
      }
      const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: staff, error: statusError } = await supabase
        .from("admins_supervisors")
        .select("status")
        .eq("id", signInData.user.id)
        .maybeSingle();

      if (statusError) {
        await supabase.auth.signOut();
        throw new Error("No se pudo verificar el estado de la cuenta. Inténtalo nuevamente.");
      }

      if (String(staff?.status ?? "").trim().toLowerCase() === "suspended") {
        await supabase.auth.signOut();
        throw new Error("Tu cuenta está suspendida. Contacta al administrador.");
      }

      toast.success("Sesión iniciada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label>Correo electrónico o teléfono</Label>
        <Input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="tu@correo.com o 70000000"
          className="focus-visible:ring-brand-orange"
          required
        />
      </div>
      <div>
        <Label>Contraseña</Label>
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="pr-10 focus-visible:ring-brand-orange"
            required
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 text-brand-blue hover:bg-brand-orange-light hover:text-brand-blue-dark"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      </div>
      <Button
        type="submit"
        disabled={busy}
        className="w-full bg-brand-blue text-white hover:bg-brand-blue-dark focus-visible:ring-brand-orange"
      >
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Iniciar Sesión
      </Button>
    </form>
  );
}
