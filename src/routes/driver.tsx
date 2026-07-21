import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, Circle, Flag } from "lucide-react";

export const Route = createFileRoute("/driver")({ ssr: false, component: DriverPage });

type Tx = { id: string; amount: number; category: string; verification_code: string; created_at: string };

function DriverPage() {
  const { profile, userId, loading } = useSession();
  const navigate = useNavigate();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [lastAmount, setLastAmount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!profile || !userId) navigate({ to: "/" });
    else if (profile.role !== "driver") navigate({ to: "/" });
  }, [loading, profile, userId, navigate]);

  useEffect(() => {
    if (!userId) return;
    const today = new Date(); today.setHours(0,0,0,0);
    supabase.from("transactions").select("*").eq("driver_id", userId).gte("created_at", today.toISOString()).order("created_at", { ascending: false })
      .then(({ data }) => setTxs((data as Tx[]) ?? []));

    const ch = supabase.channel("driver-tx-" + userId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions", filter: `driver_id=eq.${userId}` }, (payload) => {
        const t = payload.new as Tx;
        setTxs((prev) => [t, ...prev]);
        setLastCode(t.verification_code);
        setLastAmount(Number(t.amount));
        setFlash(true);
        setTimeout(() => setFlash(false), 2500);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  if (loading || !profile) return <div className="p-8">Cargando...</div>;

  if (profile.status !== "active") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-6 max-w-md text-center">
          <h2 className="text-xl font-bold">Cuenta {profile.status}</h2>
          <p className="text-sm text-muted-foreground mt-2">Tu cuenta de chofer debe ser aprobada por un supervisor antes de operar.</p>
          {profile.driver_code && <p className="mt-3 text-sm">Tu código: <strong>{profile.driver_code}</strong></p>}
          <Button className="mt-4" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>
            <LogOut className="w-4 h-4 mr-2" /> Cerrar sesión
          </Button>
        </Card>
      </div>
    );
  }

  const total = txs.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto space-y-4">
      <header className="flex items-center justify-between py-2">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Chofer</p>
          <h1 className="font-bold">{profile.first_name} {profile.paternal_surname}</h1>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" asChild>
            <Link to="/reportes"><Flag className="w-4 h-4" /></Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <Card className="p-6 text-center bg-gradient-to-br from-primary/10 to-accent">
        <p className="text-xs uppercase text-muted-foreground tracking-widest">Tu código</p>
        <div className="text-5xl font-black text-primary my-2 tracking-widest">{profile.driver_code}</div>
        <p className="text-xs text-muted-foreground">Los pasajeros ingresan este código para pagar</p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 text-center">
          <div className="text-xs text-muted-foreground">Validaciones hoy</div>
          <div className="text-3xl font-bold">{txs.length}</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-xs text-muted-foreground">Total hoy</div>
          <div className="text-3xl font-bold">Bs {total.toFixed(2)}</div>
        </Card>
      </div>

      {/* OLED Hardware simulator */}
      <div>
        <p className="text-xs text-muted-foreground mb-2 text-center">Pantalla del hardware (OLED 0.96")</p>
        <div className="oled-screen p-6 mx-auto max-w-xs aspect-[4/3] flex flex-col items-center justify-center">
          <div className="flex items-center gap-2 mb-3">
            <Circle className={`w-3 h-3 ${flash ? "fill-success text-success animate-pulse" : "fill-current opacity-30"}`} />
            <span className="text-xs opacity-80">{flash ? "PAGO OK" : "LISTO"}</span>
          </div>
          {lastCode ? (
            <>
              <div className="text-xs opacity-70">CÓDIGO</div>
              <div className="text-4xl font-bold tracking-widest tabular-nums">{lastCode}</div>
              <div className="mt-2 text-lg">Bs {lastAmount?.toFixed(2)}</div>
            </>
          ) : (
            <div className="text-sm opacity-70">Esperando pago...</div>
          )}
        </div>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold mb-2">Últimas validaciones</h3>
        <div className="divide-y text-sm">
          {txs.slice(0, 10).map((t) => (
            <div key={t.id} className="py-2 flex justify-between items-center">
              <span className="font-mono">{t.verification_code}</span>
              <span>Bs {Number(t.amount).toFixed(2)}</span>
              <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
          {txs.length === 0 && <p className="text-muted-foreground py-3">Aún no hay validaciones hoy.</p>}
        </div>
      </Card>
    </div>
  );
}
