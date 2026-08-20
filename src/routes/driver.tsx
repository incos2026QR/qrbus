import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { playSuccessChime } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  LogOut,
  Wallet,
  Loader2,
  BadgeCheck,
  Banknote,
  Bluetooth,
  BluetoothConnected,
  QrCode,
  Download,
  Eye,
  EyeOff,
  Flag,
} from "lucide-react";

import { isBluetoothSupported, linkHardware, sendPaymentOk } from "@/lib/bluetooth";
import { cleanAccount, formatAccount } from "@/lib/bank";
import { STATUS_LABELS, isActiveStatus, isBlockedStatus } from "@/lib/categories";
import { ResubmitDocs, DRIVER_DOCS } from "@/components/ResubmitDocs";
import { AdaptadorTrufi } from "@/lib/bank/trufi-adapter";
import QRCode from "qrcode";

const banco = new AdaptadorTrufi();
export const Route = createFileRoute("/driver")({ ssr: false, component: DriverPage });

type Tx = {
  id: string;
  amount: number;
  category: string;
  verification_code: string;
  created_at: string;
  tickets: number;
};

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
  const [btOpen, setBtOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [hideMoney, setHideMoney] = useState(false);

  function downloadQr() {
    if (!codeQr) return;
    const code = profile?.driver_code ?? "";
    const img = new Image();
    img.onload = () => {
      const W = 640;
      const H = 820;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#0b1b3a";
      ctx.textAlign = "center";
      ctx.font = "900 96px system-ui, sans-serif";
      ctx.fillText(code, W / 2, 150);
      const size = 460;
      ctx.drawImage(img, (W - size) / 2, 210, size, size);
      ctx.fillStyle = "#333333";
      ctx.font = "32px system-ui, sans-serif";
      ctx.fillText("Escanea el QR o ingresa el código", W / 2, 750);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${code || "chofer"}-qr.png`;
      a.click();
    };
    img.src = codeQr;
  }



  async function linkBluetooth() {
    if (!isBluetoothSupported()) return toast.error("Este navegador no soporta Web Bluetooth");
    setBtBusy(true);
    try {
      const name = await linkHardware();
      setBtName(name);
      toast.success(`Hardware ${name} enlazado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enlazar el hardware");
    } finally {
      setBtBusy(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!profile || !userId) navigate({ to: "/" });
    else if (profile.role !== "driver") navigate({ to: "/" });
  }, [loading, profile, userId, navigate]);

  useEffect(() => {
    if (!profile?.driver_code) return;
    QRCode.toDataURL(profile.driver_code, { width: 320, margin: 1 })
      .then(setCodeQr)
      .catch(() => setCodeQr(null));
  }, [profile?.driver_code]);

  useEffect(() => {
    if (!userId) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    supabase
      .from("transactions")
      .select("*")
      .eq("driver_id", userId)
      .gte("created_at", today.toISOString())
      .order("created_at", { ascending: false })
      .then(({ data }) => setTxs((data as Tx[]) ?? []));

    const ch = supabase
      .channel("driver-tx-" + userId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions",
          filter: `driver_id=eq.${userId}`,
        },
        (payload) => {
          const t = payload.new as Tx;
          setTxs((prev) => [t, ...prev]);
          setLastCode(t.verification_code);
          setLastTickets(Number(t.tickets ?? 1));
          setFlash(true);
          playSuccessChime();
          void sendPaymentOk(Number(t.amount ?? 0));
          refresh();
          setTimeout(() => setFlash(false), 3000);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  async function doWithdraw() {
    const amount = Number(wAmount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Monto inválido");
    if (!wDest.trim()) return toast.error("Selecciona tu cuenta bancaria registrada");
    setWBusy(true);
    try {
      // 1. Procesa el retiro en la base de datos local (Supabase)
      const { error } = await supabase.rpc("withdraw_earnings", {
        _amount: amount,
        _destination: wDest.trim(),
      });
      if (error) throw error;

      // 2. ⚡ DEPOSITA EL DINERO REAL EN LA API DEL BANCO ⚡
      await banco.retirarGanancias(wDest.trim(), amount);

      await refresh();
      playSuccessChime();
      toast.success(`Retiro de Bs ${amount.toFixed(2)} enviado a ${wDest.trim()}`);
      setWOpen(false);
      setWAmount("");
      setWDest("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al retirar");
    } finally {
      setWBusy(false);
    }
  }

  if (loading || !profile) return <div className="p-8">Cargando...</div>;

  if (!isActiveStatus(profile.status)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-6 max-w-md w-full space-y-3">
          <h2 className="text-xl font-bold text-center">
            Cuenta: {STATUS_LABELS[String(profile.status).toLowerCase()] ?? profile.status}
          </h2>
          <p className="text-sm text-muted-foreground text-center">
            Tu cuenta de chofer debe ser aprobada por un supervisor antes de operar.
          </p>
          {profile.driver_code && (
            <p className="text-sm text-center">
              Tu código: <strong>{profile.driver_code}</strong>
            </p>
          )}
          {isBlockedStatus(profile.status) && (
            <ResubmitDocs profile={profile} docs={DRIVER_DOCS} onDone={refresh} />
          )}
          <Button
            className="w-full"
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/" });
            }}
          >
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
  const money = (n: number) => (hideMoney ? "••••••" : `Bs ${n.toFixed(2)}`);


  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto space-y-4 relative">
      {/* Full-screen success overlay: no category, no amount */}
      {flash && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center text-center p-6">
          <BadgeCheck className="w-24 h-24 text-[#00FF66] mb-4" />
          <p className="text-4xl font-black text-[#00FF66] uppercase tracking-wide">
            ¡Pago Recibido!
          </p>
          <p className="text-3xl font-black text-white mt-2">
            {lastTickets} Pasaje{lastTickets > 1 ? "s" : ""}
          </p>
          <p className="text-white/70 mt-6 text-base uppercase tracking-[0.3em]">
            Código de validación
          </p>
          <p className="text-[5.5rem] leading-none font-black text-[#00FF66] tracking-widest tabular-nums drop-shadow-[0_0_25px_rgba(0,255,102,0.6)]">
            {lastCode}
          </p>
        </div>
      )}

      <header className="flex items-center justify-between gap-2 py-2 sticky top-0 z-30 bg-background/90 backdrop-blur border-b">
        <div className="min-w-0">
          <p className="text-xs uppercase text-muted-foreground">Chofer</p>
          <h1 className="font-bold truncate">
            {profile.first_name} {profile.paternal_surname}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          {/* Bluetooth */}
          <Dialog open={btOpen} onOpenChange={setBtOpen}>
            <DialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Enlazar tablero de hardware"
                title={btName ? `Hardware enlazado: ${btName}` : "Enlazar hardware"}
              >
                {btName ? (
                  <BluetoothConnected className="w-5 h-5 text-success" />
                ) : (
                  <Bluetooth className="w-5 h-5" />
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-full sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Tablero de Hardware</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Estado:{" "}
                  <span className={btName ? "text-success font-medium" : "font-medium"}>
                    {btName ? `Conectado (${btName})` : "Desconectado"}
                  </span>
                </p>
                <Button className="w-full" onClick={linkBluetooth} disabled={btBusy}>
                  {btBusy ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Bluetooth className="w-4 h-4 mr-2" />
                  )}
                  {btName ? "Reconectar" : "Enlazar Tablero de Hardware"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Driver QR */}
          <Dialog open={qrOpen} onOpenChange={setQrOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="Ver mi código QR">
                <QrCode className="w-5 h-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-full sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Mi código de chofer</DialogTitle>
              </DialogHeader>
              <div className="text-center space-y-3">
                <div className="text-5xl font-black text-primary tracking-widest">
                  {profile.driver_code}
                </div>
                {codeQr && (
                  <div className="bg-white p-3 rounded-lg inline-block border">
                    <img
                      src={codeQr}
                      alt={`QR del chofer ${profile.driver_code}`}
                      className="w-56 h-56"
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Los pasajeros escanean este QR (o tipean el código) para pagar
                </p>
                <Button className="w-full" onClick={downloadQr} disabled={!codeQr}>
                  <Download className="w-4 h-4 mr-2" /> Descargar QR
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button size="icon" variant="ghost" asChild aria-label="Reportes">
            <Link to="/reportes">
              <Flag className="w-5 h-5" />
            </Link>
          </Button>

          <Button
            size="icon"
            variant="ghost"
            aria-label="Cerrar sesión"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/" });
            }}
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Metrics */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Total Hoy</p>
            <div className="text-4xl font-black">{money(totalToday)}</div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label={hideMoney ? "Mostrar montos" : "Ocultar montos"}
            onClick={() => setHideMoney((v) => !v)}
          >
            {hideMoney ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Wallet className="w-4 h-4" /> Saldo Acumulado
            </div>
            <div className="text-2xl font-bold mt-1">{money(balance)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Pasajes Hoy
            </div>
            <div className="text-2xl font-bold mt-1">{totalTickets}</div>
          </div>
        </div>
      </Card>



      <Card className="p-4">
        <h3 className="font-semibold mb-2">Últimas validaciones</h3>
        <div className="divide-y text-sm">
          {txs.slice(0, 10).map((t) => (
            <div key={t.id} className="py-2 flex justify-between items-center gap-2">
              <span className="font-mono">{t.verification_code}</span>
              <span>
                {Number(t.tickets ?? 1)} pasaje{Number(t.tickets ?? 1) > 1 ? "s" : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(t.created_at).toLocaleTimeString()}
              </span>
            </div>
          ))}
          {txs.length === 0 && (
            <p className="text-muted-foreground py-3">Aún no hay validaciones hoy.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
