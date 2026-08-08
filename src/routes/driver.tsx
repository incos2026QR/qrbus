import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { playSuccessChime } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { LogOut, Circle, Flag, Wallet, Loader2, BadgeCheck, Banknote, Bluetooth, BluetoothConnected } from "lucide-react";
import { isBluetoothSupported, linkHardware, sendPaymentOk } from "@/lib/bluetooth";
import { cleanAccount, formatAccount } from "@/lib/bank";
import { STATUS_LABELS, isActiveStatus, isBlockedStatus } from "@/lib/categories";
import { ResubmitDocs, DRIVER_DOCS } from "@/components/ResubmitDocs";
import QRCode from "qrcode";


export const Route = createFileRoute("/driver")({ ssr: false, component: DriverPage });

type Tx = { id: string; amount: number; category: string; verification_code: string; created_at: string; tickets: number };

function DriverPage() {
  const { profile, userId, loading, refresh } = useSession();
  const navigate = useNavigate();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [lastTickets, setLastTickets] = useState<number>(0);
  const [flash, setFlash] = useState(false);
  const [codeQr, setCodeQr] = useState<string | null>(null);

  // Withdraw modal
  const [wOpen, setWOpen] = useState(false);
  const [wAmount, setWAmount] = useState("");
  const [wDest, setWDest] = useState("");
  const [wBusy, setWBusy] = useState(false);

  // Bluetooth hardware link
  const [btName, setBtName] = useState<string | null>(null);
  const [btBusy, setBtBusy] = useState(false);

  async function linkBluetooth() {
    if (!isBluetoothSupported()) return toast.error("Este navegador no soporta Web Bluetooth");
    setBtBusy(true);
    try {
      const name = await linkHardware();
      setBtName(name);
      toast.success(`Hardware ${name} enlazado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enlazar el hardware");
    } finally { setBtBusy(false); }
  }

  useEffect(() => {
    if (loading) return;
    if (!profile || !userId) navigate({ to: "/" });
    else if (profile.role !== "driver") navigate({ to: "/" });
  }, [loading, profile, userId, navigate]);

  useEffect(() => {
    if (!profile?.driver_code) return;
    QRCode.toDataURL(profile.driver_code, { width: 320, margin: 1 }).then(setCodeQr).catch(() => setCodeQr(null));
  }, [profile?.driver_code]);

  useEffect(() => {
    if (!userId) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    supabase.from("transactions").select("*").eq("driver_id", userId).gte("created_at", today.toISOString()).order("created_at", { ascending: false })
      .then(({ data }) => setTxs((data as Tx[]) ?? []));

    const ch = supabase.channel("driver-tx-" + userId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions", filter: `driver_id=eq.${userId}` }, (payload) => {
        const t = payload.new as Tx;
        setTxs((prev) => [t, ...prev]);
        setLastCode(t.verification_code);
        setLastTickets(Number(t.tickets ?? 1));
        setFlash(true);
        playSuccessChime();
        void sendPaymentOk(Number(t.amount ?? 0));
        refresh();
        setTimeout(() => setFlash(false), 3000);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  async function doWithdraw() {
    const amount = Number(wAmount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Monto inválido");
    if (!wDest.trim()) return toast.error("Selecciona tu cuenta bancaria registrada");
    setWBusy(true);
    try {
      const { error } = await supabase.rpc("withdraw_earnings", { _amount: amount, _destination: wDest.trim() });
      if (error) throw error;
      await refresh();
      playSuccessChime();
      toast.success(`Retiro de Bs ${amount.toFixed(2)} enviado a ${wDest.trim()}`);
      setWOpen(false); setWAmount(""); setWDest("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al retirar");
    } finally { setWBusy(false); }
  }

  if (loading || !profile) return <div className="p-8">Cargando...</div>;

  if (!isActiveStatus(profile.status)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-6 max-w-md w-full space-y-3">
          <h2 className="text-xl font-bold text-center">Cuenta: {STATUS_LABELS[String(profile.status).toLowerCase()] ?? profile.status}</h2>
          <p className="text-sm text-muted-foreground text-center">Tu cuenta de chofer debe ser aprobada por un supervisor antes de operar.</p>
          {profile.driver_code && <p className="text-sm text-center">Tu código: <strong>{profile.driver_code}</strong></p>}
          {isBlockedStatus(profile.status) && (
            <ResubmitDocs profile={profile} docs={DRIVER_DOCS} onDone={refresh} />
          )}
          <Button className="w-full" variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>
            <LogOut className="w-4 h-4 mr-2" /> Cerrar sesión
          </Button>
        </Card>
      </div>
    );
  }

  const totalTickets = txs.reduce((s, t) => s + Number(t.tickets ?? 1), 0);
  const totalToday = txs.reduce((s, t) => s + Number(t.amount), 0);
  const balance = Number(profile.balance ?? 0);
  const account = cleanAccount(profile.bank_account ?? "");


  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto space-y-4 relative">
      {/* Full-screen success overlay: no category, no amount */}
      {flash && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center text-center p-6">
          <BadgeCheck className="w-24 h-24 text-[#00FF66] mb-4" />
          <p className="text-4xl font-black text-[#00FF66] uppercase tracking-wide">¡Pago Recibido!</p>
          <p className="text-3xl font-black text-white mt-2">{lastTickets} Pasaje{lastTickets > 1 ? "s" : ""}</p>
          <p className="text-white/70 mt-6 text-base uppercase tracking-[0.3em]">Código de validación</p>
          <p className="text-[5.5rem] leading-none font-black text-[#00FF66] tracking-widest tabular-nums drop-shadow-[0_0_25px_rgba(0,255,102,0.6)]">{lastCode}</p>
        </div>
      )}

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
        {codeQr && (
          <div className="bg-white p-3 rounded-lg inline-block border">
            <img src={codeQr} alt={`QR del chofer ${profile.driver_code}`} className="w-40 h-40" />
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">Los pasajeros escanean este QR (o tipean el código) para pagar</p>
      </Card>

      <Button variant={btName ? "secondary" : "outline"} className="w-full" onClick={linkBluetooth} disabled={btBusy}>
        {btBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : btName ? <BluetoothConnected className="w-4 h-4 mr-2 text-success" /> : <Bluetooth className="w-4 h-4 mr-2" />}
        {btName ? `Hardware enlazado: ${btName}` : "Enlazar Tablero de Hardware (Bluetooth)"}
      </Button>

      {/* Earnings wallet */}
      <Card className="p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Wallet className="w-4 h-4" /> Saldo Acumulado
        </div>
        <div className="text-4xl font-black my-2">Bs {balance.toFixed(2)}</div>
        <Dialog open={wOpen} onOpenChange={(o) => { setWOpen(o); if (o && account) setWDest(account); }}>
          <DialogTrigger asChild>
            <Button className="w-full" variant="secondary"><Banknote className="w-4 h-4 mr-2" /> Retirar Ganancias</Button>
          </DialogTrigger>
          <DialogContent className="max-w-full sm:max-w-sm">
            <DialogHeader><DialogTitle>Retirar ganancias</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Monto (Bs)</Label>
                <Input type="number" min={1} step="0.5" value={wAmount} onChange={(e) => setWAmount(e.target.value)} placeholder={balance.toFixed(2)} />
                <Button type="button" variant="link" size="sm" className="px-0" onClick={() => setWAmount(balance.toFixed(2))}>Retirar todo</Button>
              </div>
              <div>
                <Label>Cuenta bancaria registrada</Label>
                {account ? (
                  <Select value={wDest || account} onValueChange={setWDest}>
                    <SelectTrigger><SelectValue placeholder="Selecciona tu cuenta" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={account}>{formatAccount(profile.bank_name, account)}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-destructive">No tienes una cuenta bancaria registrada.</p>
                )}
              </div>
              <Button className="w-full" onClick={doWithdraw} disabled={wBusy || !account}>
                {wBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Confirmar retiro
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 text-center">
          <div className="text-xs text-muted-foreground">Pasajes hoy</div>
          <div className="text-3xl font-bold">{totalTickets}</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-xs text-muted-foreground">Total hoy</div>
          <div className="text-3xl font-bold">Bs {totalToday.toFixed(2)}</div>
        </Card>
      </div>

      {/* OLED Hardware simulator — no fare or category shown */}
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
              <div className="mt-2 text-lg">{lastTickets} Pasaje{lastTickets > 1 ? "s" : ""}</div>
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
            <div key={t.id} className="py-2 flex justify-between items-center gap-2">
              <span className="font-mono">{t.verification_code}</span>
              <span>{Number(t.tickets ?? 1)} pasaje{Number(t.tickets ?? 1) > 1 ? "s" : ""}</span>
              <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
          {txs.length === 0 && <p className="text-muted-foreground py-3">Aún no hay validaciones hoy.</p>}
        </div>
      </Card>
    </div>
  );
}
