import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { QrCode, Bus, UserPlus, LogIn, Loader2 } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { seedAccounts } from "@/lib/auth.functions";
import { PassengerRegister } from "@/components/registration/PassengerRegister";
import { DriverRegister } from "@/components/registration/DriverRegister";

export const Route = createFileRoute("/")({
  ssr: false,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { profile, userId, loading } = useSession();
  const [seeded, setSeeded] = useState(false);

  // Auto-seed on first load (idempotent)
  useEffect(() => {
    if (seeded) return;
    seedAccounts()
      .then(() => setSeeded(true))
      .catch(() => setSeeded(true));
  }, [seeded]);

  useEffect(() => {
    if (loading || !userId || !profile) return;
    if (profile.role === "admin" || profile.role === "supervisor") navigate({ to: "/admin" });
    else if (profile.role === "driver") navigate({ to: "/driver" });
    else navigate({ to: "/passenger" });
  }, [loading, userId, profile, navigate]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-accent/40 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 rounded-2xl bg-primary/10 px-4 py-2">
            <QrCode className="w-6 h-6 text-primary" />
            <span className="font-bold text-primary">QR Pago Justo</span>
          </div>
          <h1 className="text-2xl font-bold mt-4">Transporte Público Bolivia</h1>
          <p className="text-sm text-muted-foreground mt-1">Pago justo con validación instantánea</p>
        </div>

        <Card className="p-6">
          <Tabs defaultValue="login">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="login"><LogIn className="w-4 h-4 mr-1" /> Login</TabsTrigger>
              <TabsTrigger value="passenger"><UserPlus className="w-4 h-4 mr-1" /> Pasajero</TabsTrigger>
              <TabsTrigger value="driver"><Bus className="w-4 h-4 mr-1" /> Chofer</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="mt-4"><LoginForm /></TabsContent>
            <TabsContent value="passenger" className="mt-4"><PassengerRegister /></TabsContent>
            <TabsContent value="driver" className="mt-4"><DriverRegister /></TabsContent>
          </Tabs>
        </Card>

        <p className="text-xs text-center text-muted-foreground mt-4">
          Cuentas pre-cargadas: admin (incos2026@gmail.com / 4Dmin-1234), supervisor1..3@pagojusto.bo / Super1234!
        </p>
      </div>
    </main>
  );
}

function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let email = identifier.trim();
      // If looks like a phone (no @), lookup email by phone
      if (!email.includes("@")) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("email")
          .eq("phone", email)
          .maybeSingle();
        if (!prof?.email) throw new Error("Teléfono no registrado");
        email = prof.email;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
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
        <Label>Email o Teléfono</Label>
        <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="tu@correo.com o 70000000" required />
      </div>
      <div>
        <Label>Contraseña</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <Button type="submit" disabled={busy} className="w-full">
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Iniciar Sesión
      </Button>
    </form>
  );
}
