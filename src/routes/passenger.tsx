import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { getSignedUrl } from "@/lib/image";
import { STATUS_LABELS, isActiveStatus, isBlockedStatus, type Category } from "@/lib/categories";
import { ResubmitDocs, PASSENGER_DOCS } from "@/components/ResubmitDocs";
import { useTarifas } from "@/lib/tarifas";
import { cleanAccount, getCoords, payFare, topUp as bankTopUp } from "@/lib/bank";

import { playSuccessChime } from "@/lib/sound";
import { QrScanner } from "@/components/QrScanner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { LogOut, Loader2, Flag, Wallet, Plus, Minus, QrCode, ScanLine, Keyboard, History, Eye, EyeOff } from "lucide-react";
import QRCode from "qrcode";

export const Route = createFileRoute("/passenger")({ ssr: false, component: PassengerPage });

type DriverInfo = {
  id: string;
  driver_code: string;
  first_name: string | null;
  paternal_surname: string | null;
  bank_account: string | null;
};

type MyTx = { id: string; verification_code: string; tickets: number; created_at: string; amount: number };

function PassengerPage() {
  const { profile, userId, loading, refresh } = useSession();
  const { tarifas, precio, nombre, error: tarifasError } = useTarifas();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [companions, setCompanions] = useState<Category[]>([]);
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pass, setPass] = useState<{ vcode: string; selfieUrl: string | null; tickets: number } | null>(null);
  const [history, setHistory] = useState<MyTx[]>([]);
  const [hideBalance, setHideBalance] = useState(true);
  const [hideAmounts, setHideAmounts] = useState(true);



  // Top-up modal
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState("20");
  const [topupQr, setTopupQr] = useState<string | null>(null);
  const [topupBusy, setTopupBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!profile || !userId) navigate({ to: "/" });
    else if (profile.role !== "passenger") navigate({ to: "/" });
  }, [loading, profile, userId, navigate]);

  useEffect(() => {
    if (!topupOpen) return;
    QRCode.toDataURL(`pagojusto://topup?amount=${topupAmount}`, { width: 260, margin: 1 })
      .then(setTopupQr)
      .catch(() => setTopupQr(null));
  }, [topupOpen, topupAmount]);

  async function loadHistory() {
    if (!userId) return;
    const { data } = await supabase
      .from("transactions")
      .select("id, verification_code, tickets, created_at, amount")
      .eq("passenger_id", userId)
      .order("created_at", { ascending: false })
      .limit(15);
    setHistory((data as MyTx[]) ?? []);
  }
  useEffect(() => { loadHistory(); }, [userId]);

  const balance = Number(profile?.balance ?? 0);
  const basePrice = precio(profile?.category ?? "general");
  const total = basePrice + companions.reduce((s, c) => s + precio(c), 0);
  const tickets = 1 + companions.length;

  async function findDriver(rawCode: string) {
    const clean = rawCode.trim().toUpperCase().replace(/^.*[/:]/, "");
    if (clean.length < 3) return toast.error("Código de chofer inválido");
    const { data, error } = await supabase.rpc("find_driver_by_code", { _code: clean });
    const row = Array.isArray(data) ? (data[0] as DriverInfo | undefined) : (data as DriverInfo | null);
    if (error || !row) return toast.error("Chofer no encontrado o no activo");
    setCode(clean);
    setCompanions([]);
    setDriver(row);
  }


  async function doTopup() {
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Monto inválido");
    setTopupBusy(true);
    try {
      const { error } = await supabase.rpc("topup_wallet", { _amount: amount, _method: "qr" });
      if (error) throw error;
      if (profile?.bank_account) {
        try { await bankTopUp(cleanAccount(profile.bank_account), amount, profile.bank_name); } catch { /* API bancaria offline */ }
      }
      await refresh();
      playSuccessChime();
      toast.success(`Saldo cargado: Bs ${amount.toFixed(2)}`);
      setTopupOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar saldo");
    } finally {
      setTopupBusy(false);
    }
  }

  async function confirmPayment() {
    if (!driver || !profile) return;
    setBusy(true);
    try {
      const coords = await getCoords();
      const { data, error } = await supabase.rpc("pay_fare", {
        _driver_code: driver.driver_code,
        _tickets: tickets,
        _lat: coords.latitud,
        _lng: coords.longitud,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("No se pudo procesar el pago");

      // Cobro en la API bancaria simulada
      if (profile.bank_account && driver.bank_account) {
        try {
          await payFare({
            cuentaOrigen: cleanAccount(profile.bank_account),
            cuentaDestino: cleanAccount(driver.bank_account),
            monto: Number(row.total),
            tarifaTipo: nombre((row.category as Category) ?? "general"),
            cantidadPasajes: tickets,
            latitud: coords.latitud,
            longitud: coords.longitud,
          }, profile.bank_name);
        } catch (apiErr) {
          toast.warning(apiErr instanceof Error ? apiErr.message : "El banco no respondió");
        }
      }

      const selfie = profile.selfie_url ? await getSignedUrl(supabase, "kyc-documents", profile.selfie_url) : null;
      playSuccessChime();
      setPass({ vcode: row.verification_code, selfieUrl: selfie, tickets });
      await refresh();
      loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !profile) return <div className="p-8">Cargando...</div>;

  if (!isActiveStatus(profile.status)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="p-6 max-w-md w-full text-center space-y-3">
          <h2 className="text-xl font-bold">Cuenta: {STATUS_LABELS[String(profile.status).toLowerCase()] ?? profile.status}</h2>
          <p className="text-sm text-muted-foreground">Tu cuenta debe ser aprobada por un supervisor antes de usar el servicio.</p>
          {isBlockedStatus(profile.status) && (
            <ResubmitDocs profile={profile} docs={PASSENGER_DOCS} onDone={refresh} />
          )}
          <Button className="w-full" variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>
            <LogOut className="w-4 h-4 mr-2" /> Cerrar sesión
          </Button>
        </Card>
      </div>
    );
  }


  if (pass) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-6 overflow-auto">
        <div className="text-center max-w-sm w-full">
          <p className="text-sm text-muted-foreground uppercase tracking-widest">Código de Validación</p>
          <div className="text-7xl font-black text-success my-4 tracking-widest tabular-nums">{pass.vcode}</div>
          {pass.selfieUrl && (
            <img src={pass.selfieUrl} alt="Selfie con CI del pasajero" className="w-40 h-40 object-cover rounded-full mx-auto border-4 border-primary shadow-lg" />
          )}
          <div className="mt-5 text-2xl font-bold">{pass.tickets} Pasaje{pass.tickets > 1 ? "s" : ""} pagado{pass.tickets > 1 ? "s" : ""}</div>
          <p className="mt-4 text-sm text-muted-foreground">Muestra este código al chofer para validar el pago.</p>
          <Button className="mt-5 w-full" variant="outline" onClick={() => { setPass(null); setDriver(null); setCode(""); setTickets(1); }}>
            Nueva validación
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-md mx-auto">
      {tarifasError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive mb-2">
          No se pudieron cargar las tarifas. Intenta nuevamente más tarde.
        </div>
      )}
      <header className="flex items-center justify-between py-3">
        <div>
          <h1 className="font-bold text-lg">Hola, {profile.first_name}</h1>
          <p className="text-xs text-muted-foreground">Pasajero activo</p>
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

      {/* 1. Scanner / código manual */}
      <Card className="p-5 space-y-4">
        {!driver && (
          <>
            {scanning ? (
              <QrScanner
                onResult={(text) => { setScanning(false); findDriver(text); }}
                onCancel={() => setScanning(false)}
              />
            ) : (
              <Button className="w-full h-14 text-base" onClick={() => setScanning(true)}>
                <ScanLine className="w-5 h-5 mr-2" /> Escanear QR del chofer
              </Button>
            )}
            <div className="pt-2 border-t">
              <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Keyboard className="w-3 h-3" /> O ingresa el código manualmente
              </Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  placeholder="DRV84"
                  className="text-center text-2xl font-bold tracking-widest uppercase"
                />
                <Button variant="secondary" onClick={() => findDriver(code)}>Buscar</Button>
              </div>
            </div>
          </>
        )}

        {driver && (
          <div className="space-y-4">
            <p className="text-sm">Chofer: <strong>{driver.first_name} {driver.paternal_surname}</strong> ({driver.driver_code})</p>

            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground text-center mb-2">Cantidad de pasajes</p>
              <div className="flex items-center justify-center gap-5">
                <Button size="icon" variant="outline" onClick={() => setTickets((t) => Math.max(1, t - 1))} aria-label="Quitar pasaje">
                  <Minus className="w-4 h-4" />
                </Button>
                <div className="text-2xl font-bold w-28 text-center">{tickets} Pasaje{tickets > 1 ? "s" : ""}</div>
                <Button size="icon" variant="outline" onClick={() => setTickets((t) => Math.min(10, t + 1))} aria-label="Agregar pasaje">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="mt-3 text-sm space-y-1">
                <div className="flex justify-between"><span>1 {nombre(profile.category ?? "general")}</span><span>Bs {basePrice.toFixed(2)}</span></div>
                {tickets > 1 && <div className="flex justify-between"><span>{tickets - 1} General</span><span>Bs {((tickets - 1) * GENERAL_PRICE).toFixed(2)}</span></div>}
                <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>Bs {total.toFixed(2)}</span></div>
              </div>
            </div>

            {balance < total && <p className="text-sm text-destructive text-center">Saldo insuficiente. Carga saldo para continuar.</p>}

            <Button onClick={confirmPayment} disabled={busy || balance < total} className="w-full h-12 text-base">
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar Pago (Bs {total.toFixed(2)})
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => { setDriver(null); setCode(""); setTickets(1); }}>Cancelar</Button>
          </div>
        )}
      </Card>

      {/* 2. Billetera virtual */}
      <Card className="p-5 mt-4 bg-gradient-to-br from-primary/15 to-accent">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Wallet className="w-4 h-4" /> Saldo Pago Justo
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={hideBalance ? "Mostrar saldo" : "Ocultar saldo"}
            onClick={() => setHideBalance((v) => !v)}
          >
            {hideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
        <div className="text-4xl font-black my-2">{hideBalance ? "••••••" : `Bs ${balance.toFixed(2)}`}</div>
        <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
          <DialogTrigger asChild>
            <Button className="w-full"><Plus className="w-4 h-4 mr-2" /> Cargar Saldo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-full sm:max-w-sm">
            <DialogHeader><DialogTitle>Cargar saldo</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Monto (Bs)</Label>
                <Input type="number" min={1} step="0.5" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} />
              </div>
              <div className="flex gap-2">
                {[10, 20, 50].map((v) => (
                  <Button key={v} type="button" size="sm" variant="outline" className="flex-1" onClick={() => setTopupAmount(String(v))}>
                    Bs {v}
                  </Button>
                ))}
              </div>
              <div className="bg-white rounded-lg border p-3 text-center">
                {topupQr ? <img src={topupQr} alt="QR de recarga" className="mx-auto w-44 h-44" /> : <QrCode className="w-24 h-24 mx-auto text-muted-foreground" />}
                <p className="text-xs text-muted-foreground mt-2">Escanea con Yape / Tigo Money / Banca Móvil</p>
              </div>
              <Button className="w-full" onClick={doTopup} disabled={topupBusy}>
                {topupBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Simular pago y acreditar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>


      <Card className="p-4 mt-4">
        <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm">
          <History className="w-4 h-4" /> Mis transacciones
        </h3>
        <div className="divide-y text-sm">
          {history.map((t) => (
            <div key={t.id} className="py-2 flex justify-between items-center gap-2">
              <span className="font-mono">{t.verification_code}</span>
              <span>{Number(t.tickets ?? 1)} pasaje{Number(t.tickets ?? 1) > 1 ? "s" : ""}</span>
              <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</span>
            </div>
          ))}
          {history.length === 0 && <p className="text-muted-foreground py-3">Aún no tienes transacciones.</p>}
        </div>
      </Card>
    </div>
  );
}
