import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { getSignedUrl } from "@/lib/image";
import { CATEGORY_LABELS, CATEGORY_PRICES, type Category } from "@/lib/categories";
import { playSuccessChime } from "@/lib/sound";
import { QrScanner } from "@/components/QrScanner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { LogOut, Loader2, Flag, Wallet, Plus, Minus, QrCode, ScanLine, Keyboard } from "lucide-react";
import QRCode from "qrcode";

export const Route = createFileRoute("/passenger")({ ssr: false, component: PassengerPage });

type DriverInfo = {
  id: string;
  driver_code: string;
  first_name: string | null;
  paternal_surname: string | null;
};

const GENERAL_PRICE = CATEGORY_PRICES.general;

function PassengerPage() {
  const { profile, userId, loading, refresh } = useSession();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [tickets, setTickets] = useState(1);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pass, setPass] = useState<{
    vcode: string;
    selfieUrl: string | null;
    base: number;
    extra: number;
    total: number;
    tickets: number;
    category: Category;
  } | null>(null);

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

  const balance = Number(profile?.balance ?? 0);
  const basePrice = profile?.category ? CATEGORY_PRICES[profile.category] : GENERAL_PRICE;
  const total = basePrice + (tickets - 1) * GENERAL_PRICE;

  async function findDriver(rawCode: string) {
    const clean = rawCode.trim().toUpperCase().replace(/^.*[/:]/, "");
    if (clean.length < 3) return toast.error("Código de chofer inválido");
    const { data, error } = await supabase.rpc("find_driver_by_code", { _code: clean });
    const row = Array.isArray(data) ? (data[0] as DriverInfo | undefined) : (data as DriverInfo | null);
    if (error || !row) return toast.error("Chofer no encontrado o no activo");
    setCode(clean);
    setTickets(1);
    setDriver(row);
  }

  async function doTopup() {
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Monto inválido");
    setTopupBusy(true);
    try {
      const { error } = await supabase.rpc("topup_wallet", { _amount: amount, _method: "qr" });
      if (error) throw error;
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
      const { data, error } = await supabase.rpc("pay_fare", { _driver_code: driver.driver_code, _tickets: tickets });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("No se pudo procesar el pago");
      const selfie = profile.selfie_url ? await getSignedUrl(supabase, "kyc-documents", profile.selfie_url) : null;
      playSuccessChime();
      setPass({
        vcode: row.verification_code,
        selfieUrl: selfie,
        base: Number(row.base_amount),
        extra: Number(row.extra_amount),
        total: Number(row.total),
        tickets,
        category: row.category as Category,
      });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
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
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-6 overflow-auto">
        <div className="text-center max-w-sm w-full">
          <p className="text-sm text-muted-foreground uppercase tracking-widest">Código de Validación</p>
          <div className="text-7xl font-black text-success my-4 tracking-widest tabular-nums">{pass.vcode}</div>
          {pass.selfieUrl && (
            <img src={pass.selfieUrl} alt="Selfie del pasajero" className="w-40 h-40 object-cover rounded-full mx-auto border-4 border-primary shadow-lg" />
          )}
          <Card className="mt-5 p-4 text-left text-sm space-y-1">
            <div className="flex justify-between">
              <span>1 {CATEGORY_LABELS[pass.category]}</span>
              <span>Bs {pass.base.toFixed(2)}</span>
            </div>
            {pass.tickets > 1 && (
              <div className="flex justify-between">
                <span>{pass.tickets - 1} General</span>
                <span>Bs {pass.extra.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t pt-1">
              <span>Total ({pass.tickets} pasaje{pass.tickets > 1 ? "s" : ""})</span>
              <span>Bs {pass.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Saldo restante</span>
              <span>Bs {balance.toFixed(2)}</span>
            </div>
          </Card>
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

      {/* Virtual wallet */}
      <Card className="p-5 bg-gradient-to-br from-primary/15 to-accent">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Wallet className="w-4 h-4" /> Saldo Pago Justo
        </div>
        <div className="text-4xl font-black my-2">Bs {balance.toFixed(2)}</div>
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

      <Card className="p-5 space-y-4 mt-4">
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
                <div className="flex justify-between"><span>1 {profile.category ? CATEGORY_LABELS[profile.category] : "General"}</span><span>Bs {basePrice.toFixed(2)}</span></div>
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
    </div>
  );
}
