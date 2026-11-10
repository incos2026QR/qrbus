import { useEffect, useRef, useState } from "react";
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
  Plus,
  Minus,
} from "lucide-react";

import { isBluetoothSupported, linkHardware, sendPaymentOk } from "@/lib/bluetooth";
import { cleanAccount, formatAccount } from "@/lib/bank";
import { STATUS_LABELS, isActiveStatus, isBlockedStatus } from "@/lib/categories";
import { ResubmitDocs, DRIVER_DOCS } from "@/components/ResubmitDocs";
import { useTarifas } from "@/lib/tarifas";
import QRCode from "qrcode";

export const Route = createFileRoute("/driver")({ ssr: false, component: DriverPage });

type Tx = {
  id: string;
  amount: number;
  category: string;
  verification_code: string;
  created_at: string;
  tickets: number;
  fare_breakdown?: FareBreakdownItem[] | null;
};

type FareBreakdownItem = {
  category: string;
  tickets: number;
  amount: number;
  kind: "titular" | "acompanante";
};

function FareBreakdown({
  transaction,
  nombre,
}: {
  transaction: Tx;
  nombre: (category: string) => string;
}) {
  const items = Array.isArray(transaction.fare_breakdown) ? transaction.fare_breakdown : [];
  const holder = items.find((item) => item.kind === "titular");
  const companions = items.filter((item) => item.kind === "acompanante");

  return (
    <div className="mt-4 w-full max-w-sm rounded-lg border border-border bg-background p-3 text-left text-foreground">
      <div className="space-y-2">
        {holder || companions.length > 0 ? (
          <>
            {holder && (
              <div className="flex items-start justify-between gap-3 text-sm">
                <span>Titular {nombre(holder.category)}</span>
                <span className="shrink-0 font-medium tabular-nums">
                  Bs {Number(holder.amount).toFixed(2)}
                </span>
              </div>
            )}
            {companions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Acompañantes:</p>
                {companions.map((item, index) => (
                  <div
                    key={`${item.category}-${index}`}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <span>
                      {item.tickets > 1 ? `${item.tickets} ` : ""}
                      {nombre(item.category)}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      Bs {Number(item.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Detalle por tipo no disponible para este pago.
          </p>
        )}
      </div>
      <div className="mt-2 flex justify-between gap-3 border-t pt-2 font-bold">
        <span>Total pagado</span>
        <span className="shrink-0 tabular-nums">Bs {Number(transaction.amount).toFixed(2)}</span>
      </div>
    </div>
  );
}

function DriverPage() {
  const { profile, userId, loading, refresh } = useSession();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const { nombre } = useTarifas();
  const navigate = useNavigate();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [lastPayment, setLastPayment] = useState<Tx | null>(null);
  const [flash, setFlash] = useState(false);
  const [codeQr, setCodeQr] = useState<string | null>(null);
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);

  // Withdraw modal
  const [wOpen, setWOpen] = useState(false);
  const [wAmount, setWAmount] = useState("");
  const [wBusy, setWBusy] = useState(false);
  const [withdrawalPending, setWithdrawalPending] = useState(false);
  const [withdrawalStatusLoading, setWithdrawalStatusLoading] = useState(true);

  // Bluetooth hardware link
  const [btName, setBtName] = useState<string | null>(null);
  const [btBusy, setBtBusy] = useState(false);
  const [btOpen, setBtOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [hideMoney, setHideMoney] = useState(true);
  const [glow, setGlow] = useState(false);
  const [showCount, setShowCount] = useState<string>("5");


  async function downloadQr() {
    if (!codeQr) return;
    const code = profile?.driver_code ?? "";
    try {
      const [qrData] = await Promise.all([
        QRCode.toDataURL(code, { width: 512, margin: 2, errorCorrectionLevel: "H" }),
      ]);
      const loadImage = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("No se pudo cargar la imagen para el QR"));
          image.src = src;
        });
      const [logo, qrImage] = await Promise.all([
        loadImage("/icons/pasaje_qr_512x512.png"),
        loadImage(qrData),
      ]);

      const W = 640;
      const H = 820;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo preparar la imagen para descargar");

      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(logo, 52, 30, 145, 145);

      ctx.fillStyle = "#7dd3fc";
      ctx.beginPath();
      ctx.roundRect(222, 42, 72, 48, 4);
      ctx.fill();
      ctx.fillStyle = "#1f4fa3";
      ctx.textAlign = "center";
      ctx.font = "bold 34px system-ui, sans-serif";
      ctx.fillText("QR", 258, 77);
      ctx.textAlign = "left";
      ctx.font = "bold 50px system-ui, sans-serif";
      ctx.fillText("Pago Justo", 220, 145, 390);
      ctx.fillStyle = "#475569";
      ctx.font = "18px system-ui, sans-serif";
      ctx.fillText("TRANSPORTE PÚBLICO CERCADO", 222, 174);

      ctx.fillStyle = "#1f4fa3";
      ctx.fillRect(55, 246, 530, 535);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(78, 273, 484, 481);
      ctx.fillStyle = "#1f4fa3";
      ctx.beginPath();
      ctx.roundRect(130, 212, 380, 72, 24);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = "bold 48px system-ui, sans-serif";
      ctx.fillText("ESCANÉAME", W / 2, 263);

      ctx.fillStyle = "#0b1b3a";
      ctx.font = "bold 64px system-ui, sans-serif";
      ctx.fillText(code, W / 2, 354);
      const size = 340;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(qrImage, (W - size) / 2, 370, size, size);
      ctx.fillStyle = "#1f2937";
      ctx.font = "20px system-ui, sans-serif";
      ctx.fillText("Escanea el QR o ingresa el código", W / 2, 743);

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${code || "chofer"}-qr.png`;
      a.click();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo descargar el QR");
    }
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
    if (!userId || profile?.role !== "driver") return;
    let cancelled = false;

    async function loadWithdrawalStatus() {
      setWithdrawalStatusLoading(true);
      const { data, error } = await supabase.functions.invoke("bank-withdraw", {
        body: { action: "status" },
      });
      if (!cancelled) {
        if (!error) setWithdrawalPending(Boolean((data as { pending?: boolean })?.pending));
        setWithdrawalStatusLoading(false);
      }
    }

    void loadWithdrawalStatus();
    return () => {
      cancelled = true;
    };
  }, [userId, profile?.role]);

  useEffect(() => {
    if (!userId) return;
    const driverId = userId;
    let active = true;
    let flashTimeout: ReturnType<typeof setTimeout> | undefined;
    let glowTimeout: ReturnType<typeof setTimeout> | undefined;

    function mergeTransactions(current: Tx[], incoming: Tx[]) {
      const byId = new Map(current.map((transaction) => [transaction.id, transaction]));
      for (const transaction of incoming) byId.set(transaction.id, transaction);
      return Array.from(byId.values()).sort(
        (first, second) =>
          new Date(second.created_at).getTime() - new Date(first.created_at).getTime(),
      );
    }

    async function loadTodayTransactions() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("driver_id", driverId)
        .gte("created_at", today.toISOString())
        .order("created_at", { ascending: false })
        .limit(500);
      if (!active) return;
      if (error) {
        toast.error(`No se pudieron cargar las validaciones: ${error.message}`);
        return;
      }
      setTxs((current) => mergeTransactions(current, (data as Tx[]) ?? []));
    }

    const ch = supabase
      .channel("driver-tx-" + driverId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions",
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          const t = payload.new as Tx;
          setTxs((current) => mergeTransactions(current, [t]));
          setLastPayment(t);
          setFlash(true);
          setGlow(true);
          playSuccessChime();
          void sendPaymentOk(Number(t.amount ?? 0));
          void refreshRef.current();
          if (flashTimeout) clearTimeout(flashTimeout);
          if (glowTimeout) clearTimeout(glowTimeout);
          flashTimeout = setTimeout(() => setFlash(false), 5000);
          glowTimeout = setTimeout(() => setGlow(false), 10000);
        },
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          void loadTodayTransactions();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          toast.error(
            `No se pudo mantener la actualización en tiempo real${error?.message ? `: ${error.message}` : "."}`,
          );
        }
      });
    return () => {
      active = false;
      if (flashTimeout) clearTimeout(flashTimeout);
      if (glowTimeout) clearTimeout(glowTimeout);
      supabase.removeChannel(ch);
    };
  }, [userId]);

  async function doWithdraw() {
    const amount = Number(wAmount);
    const balance = Number(profile?.balance ?? 0);
    const account = cleanAccount(profile?.bank_account ?? "");
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
      return toast.error("Ingresa un monto válido de hasta Bs 1.000");
    }
    if (amount > balance) return toast.error("Saldo insuficiente");
    if (!account) return toast.error("No tienes una cuenta bancaria registrada");
    if (withdrawalPending) return toast.error("Ya tienes un retiro en revisión");

    setWBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("bank-withdraw", {
        body: { amount },
      });

      if (error) {
        let message = error.message;
        let reconciliationRequired = false;
        const response = (error as { context?: Response }).context;
        if (response) {
          try {
            const body = (await response.json()) as {
              error?: string;
              reconciliationRequired?: boolean;
            };
            if (body.error) message = body.error;
            reconciliationRequired = Boolean(body.reconciliationRequired);
          } catch {
            // Conserva el mensaje original cuando la respuesta no sea JSON.
          }
        }
        if (reconciliationRequired) setWithdrawalPending(true);
        throw new Error(message);
      }

      const result = data as {
        ok?: boolean;
        walletBalance?: number;
        bankBalance?: number | null;
        error?: string;
      } | null;
      if (!result?.ok) throw new Error(result?.error || "No se pudo completar el retiro");

      await refresh();
      setWithdrawalPending(false);
      playSuccessChime();
      toast.success(`Retiro de Bs ${amount.toFixed(2)} enviado a ${formatAccount(profile?.bank_name, account)}`);
      setWOpen(false);
      setWAmount("");
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
      {/* Full-screen success overlay */}
      {flash && (
        <div className="fixed inset-0 z-50 flex min-h-full flex-col items-center justify-start overflow-y-auto bg-black p-6 py-8 text-center sm:justify-center">
          <BadgeCheck className="w-24 h-24 text-[#00FF66] mb-4" />
          <p className="text-4xl font-black text-[#00FF66] uppercase tracking-wide">
            ¡Pago Recibido!
          </p>
          <p className="text-3xl font-black text-white mt-2">
            {Number(lastPayment?.tickets ?? 1)} Pasaje
            {Number(lastPayment?.tickets ?? 1) > 1 ? "s" : ""}
          </p>
          <p className="text-white/70 mt-6 text-base uppercase tracking-[0.3em]">
            Código de validación
          </p>
          <p className="text-[5.5rem] leading-none font-black text-[#00FF66] tracking-widest tabular-nums drop-shadow-[0_0_25px_rgba(0,255,102,0.6)]">
            {lastPayment?.verification_code}
          </p>
          {lastPayment && <FareBreakdown transaction={lastPayment} nombre={nombre} />}
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

          {/* Retirar ganancias */}
          <Dialog
            open={wOpen}
            onOpenChange={setWOpen}
          >
            <DialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Retirar ganancias"
                title={
                  withdrawalPending
                    ? "Retiro en revisión"
                    : !account
                      ? "Registra una cuenta bancaria para retirar"
                      : balance <= 0
                        ? "No tienes saldo disponible"
                        : "Retirar ganancias"
                }
                disabled={
                  balance <= 0 || !account || withdrawalPending || withdrawalStatusLoading
                }
              >
                <Banknote className="w-5 h-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-full sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Retirar ganancias</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Monto (Bs)</Label>
                  <Input
                    type="number"
                    min={1}
                    step="0.5"
                    value={wAmount}
                    onChange={(e) => setWAmount(e.target.value)}
                    placeholder={balance.toFixed(2)}
                  />
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="px-0"
                    onClick={() => setWAmount(balance.toFixed(2))}
                  >
                    Retirar todo
                  </Button>
                </div>
                <div>
                  <Label>Cuenta bancaria registrada</Label>
                  {account ? (
                    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      {formatAccount(profile.bank_name, account)}
                    </p>
                  ) : (
                    <p className="text-sm text-destructive">
                      No tienes una cuenta bancaria registrada.
                    </p>
                  )}
                </div>
                <Button
                  className="w-full"
                  onClick={doWithdraw}
                  disabled={
                    wBusy ||
                    !account ||
                    withdrawalPending ||
                    Number(wAmount) <= 0 ||
                    Number(wAmount) > Math.min(balance, 1000)
                  }
                >
                  {wBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Confirmar retiro
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

      {withdrawalPending && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Tu retiro está en revisión. El saldo permanece reservado y no debes repetir la operación.
        </div>
      )}

      {/* 1. Última validación destacada */}
      {txs[0] && (
        <div
          className={`rounded-2xl bg-emerald-500 text-white p-6 text-center shadow-lg ${glow ? "animate-pulse ring-8 ring-emerald-300/60" : ""}`}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-white/80">Última validación</p>
          <div className="text-5xl font-black tracking-widest tabular-nums my-2">
            {txs[0].verification_code}
          </div>
          <p className="text-xl font-bold">
            {Number(txs[0].tickets ?? 1)} Pasaje{Number(txs[0].tickets ?? 1) > 1 ? "s" : ""} · Pago recibido
          </p>
          <FareBreakdown transaction={txs[0]} nombre={nombre} />
        </div>
      )}

      {/* 2. Validaciones recientes */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="font-semibold">Validaciones recientes</h3>
          <div className="flex items-center gap-1">
            {["3", "5", "10", "all"].map((v) => (
              <Button
                key={v}
                size="sm"
                variant={showCount === v ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => setShowCount(v)}
              >
                {v === "all" ? "Todas" : v}
              </Button>
            ))}
          </div>
        </div>
        <div className="divide-y text-sm">
          {(showCount === "all" ? txs : txs.slice(0, Number(showCount))).map((t) => (
            <div key={t.id} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-base font-bold">{t.verification_code}</span>
                <span>
                  {Number(t.tickets ?? 1)} pasaje{Number(t.tickets ?? 1) > 1 ? "s" : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(t.created_at).toLocaleTimeString()}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 shrink-0"
                  aria-label={
                    expandedTransactionId === t.id
                      ? `Ocultar desglose del pago ${t.verification_code}`
                      : `Ver desglose del pago ${t.verification_code}`
                  }
                  aria-expanded={expandedTransactionId === t.id}
                  onClick={() =>
                    setExpandedTransactionId((current) => (current === t.id ? null : t.id))
                  }
                >
                  {expandedTransactionId === t.id ? (
                    <Minus className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {expandedTransactionId === t.id && (
                <div className="pl-1">
                  <FareBreakdown transaction={t} nombre={nombre} />
                </div>
              )}
            </div>
          ))}
          {txs.length === 0 && (
            <p className="text-muted-foreground py-3">Aún no hay validaciones hoy.</p>
          )}
        </div>
      </Card>

      {/* 3. Métricas consolidadas (abajo, por privacidad) */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Total recaudado hoy</p>
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

    </div>
  );
}
