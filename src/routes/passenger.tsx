import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useSession } from "@/hooks/use-session";
import { getSignedUrl } from "@/lib/image";
import { STATUS_LABELS, isActiveStatus, isBlockedStatus, type Category } from "@/lib/categories";
import { ResubmitDocs, PASSENGER_DOCS } from "@/components/ResubmitDocs";
import { useTarifas } from "@/lib/tarifas";
import { getCoords } from "@/lib/bank";

import { playSuccessChime } from "@/lib/sound";
import { QrScanner } from "@/components/QrScanner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Loader2,
  Flag,
  Wallet,
  Plus,
  Minus,
  QrCode,
  ScanLine,
  Keyboard,
  History,
  Eye,
  EyeOff,
  Users,
  Star,
} from "lucide-react";
import QRCode from "qrcode";
const CATEGORY_OPTIONS: Category[] = [
  "general",
  "primaria",
  "secundaria",
  "universitario",
  "adulto_mayor",
  "discapacidad",
];

const POSITIVE_RATING_REASONS = [
  { value: "trato_amable", label: "Trato amable" },
  { value: "conduccion_segura", label: "Conducción segura" },
  { value: "cobro_correcto", label: "Cobro correcto" },
  { value: "respeto_pasaje_diferenciado", label: "Respeto al pasaje diferenciado" },
  { value: "vehiculo_buen_estado", label: "Vehículo en buenas condiciones" },
] as const;

const IMPROVEMENT_RATING_REASONS = [
  { value: "trato_mejorable", label: "El trato podría mejorar" },
  { value: "conduccion_puede_mejorar", label: "La conducción podría mejorar" },
  { value: "cobro_puede_mejorar", label: "El cobro podría ser más claro" },
  {
    value: "respeto_pasaje_diferenciado_puede_mejorar",
    label: "Podría mejorar el respeto al pasaje diferenciado",
  },
  { value: "vehiculo_requiere_mejoras", label: "El vehículo podría mejorar" },
] as const;

function getRatingReasons(rating: number, transactionId: string) {
  const reasons =
    rating === 5
      ? POSITIVE_RATING_REASONS
      : rating >= 4
        ? IMPROVEMENT_RATING_REASONS
        : [...POSITIVE_RATING_REASONS, ...IMPROVEMENT_RATING_REASONS];

  if (reasons.length <= 5) return reasons;

  function hash(value: string) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result = Math.imul(result ^ value.charCodeAt(index), 16777619);
    }
    return result >>> 0;
  }

  return [...reasons]
    .sort((left, right) => {
      const difference =
        hash(`${transactionId}:${left.value}`) - hash(`${transactionId}:${right.value}`);
      return difference || left.value.localeCompare(right.value);
    })
    .slice(0, 5);
}

function getRatingReasonLabel(value: string) {
  return [...POSITIVE_RATING_REASONS, ...IMPROVEMENT_RATING_REASONS].find(
    (reason) => reason.value === value,
  )?.label;
}

export const Route = createFileRoute("/passenger")({ ssr: false, component: PassengerPage });

type DriverInfo = {
  id: string;
  driver_code: string;
  first_name: string | null;
  paternal_surname: string | null;
  bank_account: string | null;
};

type MyTx = {
  id: string;
  verification_code: string;
  tickets: number;
  created_at: string;
  amount: number;
  fare_breakdown?: Json | null;
  rating?: number;
  selected_comments?: string[];
  comment?: string | null;
};

type FareBreakdownItem = {
  category: string;
  tickets: number;
  amount: number;
  kind: "titular" | "acompanante";
};

function isFareBreakdownItem(value: Json): value is FareBreakdownItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return (
    typeof value.category === "string" &&
    typeof value.tickets === "number" &&
    typeof value.amount === "number" &&
    (value.kind === "titular" || value.kind === "acompanante")
  );
}

function FareBreakdown({
  transaction,
  nombre,
  hideAmounts,
}: {
  transaction: MyTx;
  nombre: (category: string) => string;
  hideAmounts: boolean;
}) {
  const items = Array.isArray(transaction.fare_breakdown)
    ? transaction.fare_breakdown.filter(isFareBreakdownItem)
    : [];
  const holder = items.find((item) => item.kind === "titular");
  const companions = items.filter((item) => item.kind === "acompanante");
  const amountLabel = (amount: number) =>
    hideAmounts ? "••••" : `Bs ${Number(amount).toFixed(2)}`;

  return (
    <div className="mt-3 w-full max-w-sm rounded-lg border border-brand-blue/15 bg-card/90 p-3 text-left">
      <div className="space-y-2">
        {holder || companions.length > 0 ? (
          <>
            {holder && (
              <div className="flex items-start justify-between gap-3 text-sm">
                <span>Titular {nombre(holder.category)}</span>
                <span className="shrink-0 font-medium tabular-nums">
                  {amountLabel(holder.amount)}
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
                      {amountLabel(item.amount)}
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
      <div className="mt-2 flex justify-between gap-3 border-t pt-2 text-sm font-bold">
        <span>Total pagado</span>
        <span className="shrink-0 tabular-nums">{amountLabel(transaction.amount)}</span>
      </div>
    </div>
  );
}

function StarRatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center" role="group" aria-label="Calificación de media estrella a cinco estrellas">
      {Array.from({ length: 5 }, (_, index) => {
        const wholeStar = index + 1;
        const halfStar = wholeStar - 0.5;
        const fillWidth = value >= wholeStar ? "100%" : value >= halfStar ? "50%" : "0";
        return (
          <span key={wholeStar} className="relative inline-flex h-8 w-8">
            <Star className="absolute inset-1 h-6 w-6 text-amber-500" />
            <span
              className="pointer-events-none absolute inset-y-1 left-1 overflow-hidden text-amber-500"
              style={{ width: fillWidth }}
            >
              <Star className="h-6 w-6 fill-current" />
            </span>
            <button
              type="button"
              disabled={disabled}
              className="absolute inset-y-0 left-0 w-1/2 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed"
              aria-label={`${halfStar} estrellas`}
              aria-pressed={value === halfStar}
              onClick={() => onChange(halfStar)}
            />
            <button
              type="button"
              disabled={disabled}
              className="absolute inset-y-0 right-0 w-1/2 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed"
              aria-label={`${wholeStar} ${wholeStar === 1 ? "estrella" : "estrellas"}`}
              aria-pressed={value === wholeStar}
              onClick={() => onChange(wholeStar)}
            />
          </span>
        );
      })}
      <span className="ml-2 min-w-8 text-sm tabular-nums text-muted-foreground">
        {value ? `${value.toFixed(1).replace(/\.0$/, "")}/5` : "—"}
      </span>
    </div>
  );
}

function PassengerPage() {
  const { profile, userId, loading, refresh } = useSession();
  const { precio, nombre, error: tarifasError } = useTarifas();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [companions, setCompanions] = useState<Category[]>([]);
  const [defaultCompanions, setDefaultCompanions] = useState<Category[]>([]);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [companionSettingsOpen, setCompanionSettingsOpen] = useState(false);
  const [companionDraft, setCompanionDraft] = useState<Category[]>([]);
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pass, setPass] = useState<{
    vcode: string;
    selfieUrl: string | null;
    total: number;
    items: { category: string; amount: number; count: number }[];
  } | null>(null);
  const [history, setHistory] = useState<MyTx[]>([]);
  const [ratingSelections, setRatingSelections] = useState<Record<string, number>>({});
  const [ratingReasonSelections, setRatingReasonSelections] = useState<
    Record<string, string[]>
  >({});
  const [ratingComments, setRatingComments] = useState<Record<string, string>>({});
  const [ratingSavingId, setRatingSavingId] = useState<string | null>(null);
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState<"5" | "10" | "20" | "all">("5");
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

  const loadHistory = useCallback(async () => {
    if (!userId) return;
    let query = supabase
      .from("transactions")
      .select("id, verification_code, tickets, created_at, amount, fare_breakdown")
      .eq("passenger_id", userId)
      .order("created_at", { ascending: false });
    if (historyLimit !== "all") query = query.limit(Number(historyLimit));
    const { data, error } = await query;
    if (error) {
      console.error("Error al cargar transacciones:", error);
      toast.error("No se pudo cargar el historial de transacciones");
      return;
    }

    const transactions = data ?? [];
    if (transactions.length === 0) {
      setHistory([]);
      return;
    }

    const { data: ratings, error: ratingsError } = await supabase
      .from("transaction_ratings")
      .select("transaction_id, rating, selected_comments, comment")
      .in(
        "transaction_id",
        transactions.map((transaction) => transaction.id),
      );
    if (ratingsError) {
      console.error("Error al cargar calificaciones:", ratingsError);
      toast.error("No se pudieron cargar las calificaciones");
      return;
    }

    const ratingsByTransaction = new Map((ratings ?? []).map((rating) => [rating.transaction_id, rating]));
    setHistory(
      transactions.map((transaction) => ({
        ...transaction,
        rating: ratingsByTransaction.has(transaction.id)
          ? Number(ratingsByTransaction.get(transaction.id)?.rating)
          : undefined,
        selected_comments: ratingsByTransaction.get(transaction.id)?.selected_comments ?? [],
        comment: ratingsByTransaction.get(transaction.id)?.comment ?? null,
      })),
    );
  }, [userId, historyLimit]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const loadCompanionDefaults = useCallback(async () => {
    if (!userId) return [];
    const { data, error } = await supabase
      .from("passenger_companion_defaults")
      .select("categories")
      .eq("passenger_id", userId)
      .maybeSingle();
    if (error) throw error;
    const categories = data?.categories ?? [];
    setDefaultCompanions(categories);
    return categories;
  }, [userId]);

  useEffect(() => {
    loadCompanionDefaults().catch((error: unknown) => {
      console.error("Error al cargar acompañantes predeterminados:", error);
      toast.error("No se pudieron cargar los acompañantes predeterminados");
    });
  }, [loadCompanionDefaults]);

  const balance = Number(profile?.balance ?? 0);
  const basePrice = precio(profile?.category ?? "general");
  const total = basePrice + companions.reduce((s, c) => s + precio(c), 0);
  const tickets = 1 + companions.length;
  const companionSummary = companions.reduce<{ category: Category; count: number }[]>(
    (summary, category) => {
      const existing = summary.find((item) => item.category === category);
      if (existing) existing.count += 1;
      else summary.push({ category, count: 1 });
      return summary;
    },
    [],
  );
  const companionDraftSummary = companionDraft.reduce<{ category: Category; count: number }[]>(
    (summary, category) => {
      const existing = summary.find((item) => item.category === category);
      if (existing) existing.count += 1;
      else summary.push({ category, count: 1 });
      return summary;
    },
    [],
  );
  function addCompanion() {
    setCompanions((current) => {
      if (current.length >= 9) return current;
      const preferredCategory = profile?.category ?? "general";
      const category =
        CATEGORY_OPTIONS.find(
          (option) => option === preferredCategory && !current.includes(option),
        ) ?? CATEGORY_OPTIONS.find((option) => !current.includes(option));
      return category ? [...current, category] : current;
    });
  }

  async function findDriver(rawCode: string) {
    const clean = rawCode
      .trim()
      .toUpperCase()
      .replace(/^.*[/:]/, "");
    if (clean.length < 3) return toast.error("Código de chofer inválido");
    const { data, error } = await supabase.rpc("find_driver_by_code", { _code: clean });
    const row = Array.isArray(data)
      ? (data[0] as DriverInfo | undefined)
      : (data as DriverInfo | null);
    if (error || !row) return toast.error("Chofer no encontrado o no activo");
    let savedCompanions: Category[];
    try {
      savedCompanions = await loadCompanionDefaults();
    } catch (loadError) {
      console.error("Error al cargar acompañantes predeterminados:", loadError);
      return toast.error("No se pudieron cargar los acompañantes predeterminados");
    }
    setCode(clean);
    setCompanions(savedCompanions);
    setDriver(row);
  }

  async function saveCompanionDefaults(categories: Category[]): Promise<boolean> {
    setSavingDefaults(true);
    try {
      const { error } = await supabase.rpc("save_my_companion_defaults", {
        _companions: categories,
      });
      if (error) throw error;
      setDefaultCompanions(categories);
      if (driver) setCompanions(categories);
      toast.success(
        categories.length
          ? "Acompañantes guardados para próximos pagos"
          : "Acompañantes predeterminados eliminados",
      );
      return true;
    } catch (error) {
      console.error("Error al guardar acompañantes predeterminados:", error);
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la configuración");
      return false;
    } finally {
      setSavingDefaults(false);
    }
  }

  function addDefaultCompanion() {
    setCompanionDraft((current) => {
      if (current.length >= 9) return current;
      const preferredCategory = profile?.category ?? "general";
      const category =
        CATEGORY_OPTIONS.find(
          (option) => option === preferredCategory && !current.includes(option),
        ) ?? CATEGORY_OPTIONS.find((option) => !current.includes(option));
      return category ? [...current, category] : current;
    });
  }

  async function saveRating(transaction: MyTx) {
    const rating = ratingSelections[transaction.id];
    if (
      !userId ||
      !Number.isFinite(rating) ||
      rating < 0.5 ||
      rating > 5 ||
      rating * 2 !== Math.trunc(rating * 2)
    ) {
      return;
    }
    const comment = ratingComments[transaction.id]?.trim() ?? "";
    if (comment.length > 500) return toast.error("El comentario no puede superar 500 caracteres");
    setRatingSavingId(transaction.id);
    try {
      const { error } = await supabase.from("transaction_ratings").insert({
        transaction_id: transaction.id,
        passenger_id: userId,
        rating,
        selected_comments: ratingReasonSelections[transaction.id] ?? [],
        comment: comment || null,
      });
      if (error) throw error;
      setHistory((current) =>
        current.map((item) =>
          item.id === transaction.id
            ? {
                ...item,
                rating,
                selected_comments: ratingReasonSelections[transaction.id] ?? [],
                comment: comment || null,
              }
            : item,
        ),
      );
      toast.success("Gracias por calificar al chofer");
    } catch (error) {
      console.error("Error al guardar calificación:", error);
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la calificación");
    } finally {
      setRatingSavingId(null);
    }
  }

  async function doTopup() {
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
      return toast.error("Ingresa un monto válido de hasta Bs 1.000");
    }

    if (!profile?.bank_account) {
      return toast.error("No tienes una cuenta bancaria registrada para recargar");
    }

    setTopupBusy(true);
    try {
      // El servidor registra la solicitud, debita el banco y acredita la billetera
      // en ese orden. El navegador nunca debe acreditar saldo directamente.
      const { data, error } = await supabase.functions.invoke("bank-topup", {
        body: { amount },
      });

      if (error) {
        let message = error.message;
        const response = (error as { context?: Response }).context;

        if (response) {
          try {
            const body = (await response.json()) as { error?: string };
            if (body.error) message = body.error;
          } catch {
            // Conserva el mensaje original cuando la respuesta no sea JSON.
          }
        }

        throw new Error(message);
      }

      const result = data as {
        ok?: boolean;
        walletBalance?: number;
        bankBalance?: number;
        error?: string;
      } | null;
      if (!result?.ok) throw new Error(result?.error || "No se pudo completar la recarga");

      await refresh();

      playSuccessChime();
      toast.success(`Saldo cargado. Nuevo saldo: Bs ${Number(result.walletBalance).toFixed(2)}`);
      setTopupOpen(false);
    } catch (e) {
      console.error("Error en doTopup:", e);
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
      const { data, error } = await supabase.rpc("pay_fare_group", {
        _driver_code: driver.driver_code,
        _companions: companions,
        _lat: coords.latitud ?? undefined,
        _lng: coords.longitud ?? undefined,
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("No se pudo procesar el pago");

      const passengerCategory = profile.category ?? "general";
      const paidItems = [
        {
          category: nombre(passengerCategory),
          amount: Number(row.base_amount),
          count: 1,
        },
        ...companionSummary.map(({ category, count }) => ({
          category: nombre(category),
          amount: precio(category) * count,
          count,
        })),
      ];
      const selfie = profile.selfie_url
        ? await getSignedUrl(supabase, "kyc-documents", profile.selfie_url)
        : null;
      playSuccessChime();
      setPass({
        vcode: row.verification_code,
        selfieUrl: selfie,
        total: Number(row.total),
        items: paidItems,
      });
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
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-brand-blue-light/40 via-background to-brand-orange-light/30">
        <Card className="max-w-md w-full space-y-3 border-brand-blue/15 p-6 text-center">
          <h2 className="text-xl font-bold">
            Cuenta: {STATUS_LABELS[String(profile.status).toLowerCase()] ?? profile.status}
          </h2>
          <p className="text-sm text-muted-foreground">
            Tu cuenta debe ser aprobada por un supervisor antes de usar el servicio.
          </p>
          {isBlockedStatus(profile.status) && (
            <ResubmitDocs profile={profile} docs={PASSENGER_DOCS} onDone={refresh} />
          )}
          <Button
            className="w-full border-brand-blue text-brand-blue hover:bg-brand-blue-light"
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

  if (pass) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center overflow-auto bg-gradient-to-br from-brand-blue-light/40 via-background to-brand-orange-light/30 p-6">
        <div className="text-center max-w-sm w-full">
          <p className="text-sm text-muted-foreground uppercase tracking-widest">
            Código de Validación
          </p>
          <div className="text-7xl font-black text-success my-4 tracking-widest tabular-nums">
            {pass.vcode}
          </div>
          {pass.selfieUrl && (
            <img
              src={pass.selfieUrl}
              alt="Selfie con CI del pasajero"
              className="mx-auto h-40 w-40 rounded-full border-4 border-brand-orange object-cover shadow-lg"
            />
          )}
          <div className="mt-5 text-2xl font-bold">
            {pass.items.length} {pass.items.length === 1 ? "Pasaje pagado" : "Pasajes pagados"}
          </div>
          <div className="mt-3 space-y-2 rounded-md border border-brand-blue/15 bg-card/90 p-3 text-left">
            <div className="flex justify-between gap-3 text-sm">
              <span>{pass.items[0].category}</span>
              <span className="shrink-0">Bs {pass.items[0].amount.toFixed(2)}</span>
            </div>
            {pass.items.length > 1 && (
              <>
                <p className="pt-1 text-xs font-semibold text-muted-foreground">Acompañantes</p>
                {pass.items.slice(1).map((item) => (
                  <div key={item.category} className="flex justify-between gap-3 text-sm">
                    <span>
                      {item.count} {item.category}
                    </span>
                    <span className="shrink-0">Bs {item.amount.toFixed(2)}</span>
                  </div>
                ))}
              </>
            )}
            <div className="flex justify-between gap-3 border-t pt-2 font-bold">
              <span>Total pagado</span>
              <span className="shrink-0">Bs {pass.total.toFixed(2)}</span>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Muestra este código al chofer para validar el pago.
          </p>
          <Button
            className="mt-5 w-full bg-brand-blue text-white hover:bg-brand-blue-dark focus-visible:ring-brand-orange"
            onClick={() => {
              setPass(null);
              setDriver(null);
              setCode("");
              setCompanions([]);
              setScanning(true);
            }}
          >
            Nueva validación
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-gradient-to-b from-brand-blue-light/40 via-background to-brand-orange-light/30 p-4">
      {tarifasError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive mb-2">
          No se pudieron cargar las tarifas. Intenta nuevamente más tarde.
        </div>
      )}
      <header className="flex items-center justify-between border-b border-brand-blue/15 py-3">
        <div>
          <h1 className="font-bold text-lg">Hola, {profile.first_name}</h1>
          <p className="text-xs text-muted-foreground">Pasajero activo</p>
        </div>
        <div className="flex gap-1">
          <Dialog
            open={companionSettingsOpen}
            onOpenChange={(open) => {
              if (open) setCompanionDraft(defaultCompanions);
              setCompanionSettingsOpen(open);
            }}
          >
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="text-brand-blue hover:bg-brand-orange-light hover:text-brand-blue-dark"
                aria-label="Configurar acompañantes predeterminados"
                title="Configurar acompañantes predeterminados"
              >
                <Users className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
              <DialogHeader>
                <DialogTitle>Acompañantes predeterminados</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Se agregarán automáticamente cada vez que busques un chofer. Puedes ajustarlos
                  antes de confirmar cada pago.
                </p>
                <div className="space-y-2">
                  {companionDraftSummary.map(({ category, count }) => (
                    <div
                      key={category}
                      className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_2rem_1.5rem_2rem] items-center gap-1"
                    >
                      <Select
                        value={category}
                        onValueChange={(value) => {
                          const selectedCategory = CATEGORY_OPTIONS.find(
                            (option) => option === value,
                          );
                          if (!selectedCategory) return;
                          setCompanionDraft((current) =>
                            current.map((existing) =>
                              existing === category ? selectedCategory : existing,
                            ),
                          );
                        }}
                      >
                        <SelectTrigger className="min-w-0 w-full">
                          <SelectValue className="min-w-0 flex-1 truncate text-left" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORY_OPTIONS.filter(
                            (option) => option === category || !companionDraft.includes(option),
                          ).map((option) => (
                            <SelectItem key={option} value={option}>
                              {nombre(option)} · Bs {precio(option).toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0 border-brand-blue/20 p-0 text-brand-blue hover:bg-brand-blue-light"
                        aria-label={`Agregar acompañante ${nombre(category)}`}
                        disabled={companionDraft.length >= 9}
                        onClick={() =>
                          setCompanionDraft((current) =>
                            current.length >= 9 ? current : [...current, category],
                          )
                        }
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <span
                        className="min-w-0 text-center text-sm"
                        aria-label={`${count} acompañantes`}
                      >
                        {count}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0 border-brand-blue/20 p-0 text-brand-blue hover:bg-brand-blue-light"
                        aria-label={`Quitar acompañante ${nombre(category)}`}
                        onClick={() =>
                          setCompanionDraft((current) => {
                            const index = current.indexOf(category);
                            return index < 0 ? current : current.filter((_, i) => i !== index);
                          })
                        }
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-brand-blue text-brand-blue hover:bg-brand-blue-light"
                  disabled={
                    companionDraft.length >= 9 ||
                    CATEGORY_OPTIONS.every((option) => companionDraft.includes(option))
                  }
                  onClick={addDefaultCompanion}
                >
                  <Plus className="mr-2 h-4 w-4" /> Agregar acompañante
                </Button>
                <p className="text-right text-xs text-muted-foreground">
                  {companionDraft.length} de 9 acompañantes
                </p>
                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-brand-blue/20 text-brand-blue hover:bg-brand-blue-light"
                    onClick={() => setCompanionSettingsOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="bg-brand-blue text-white hover:bg-brand-blue-dark focus-visible:ring-brand-orange"
                    disabled={savingDefaults}
                    onClick={async () => {
                      if (await saveCompanionDefaults(companionDraft)) {
                        setCompanionSettingsOpen(false);
                      }
                    }}
                  >
                    {savingDefaults && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            size="sm"
            variant="ghost"
            className="text-brand-blue hover:bg-brand-orange-light hover:text-brand-blue-dark"
            asChild
            aria-label="Reportes"
          >
            <Link to="/reportes">
              <Flag className="w-4 h-4" />
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-brand-blue hover:bg-brand-orange-light hover:text-brand-blue-dark"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/" });
            }}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* 1. Scanner / código manual */}
      <Card className="space-y-4 border-brand-blue/15 p-5 shadow-md">
        {!driver && (
          <>
            {scanning ? (
              <QrScanner
                onResult={(text) => {
                  setScanning(false);
                  findDriver(text);
                }}
                onCancel={() => setScanning(false)}
              />
            ) : (
              <Button
                className="h-14 w-full bg-brand-blue text-base text-white hover:bg-brand-blue-dark"
                onClick={() => setScanning(true)}
              >
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
                <Button
                  variant="outline"
                  className="border-brand-blue text-brand-blue hover:bg-brand-blue-light"
                  onClick={() => findDriver(code)}
                >
                  Buscar
                </Button>
              </div>
            </div>
          </>
        )}

        {driver && (
          <div className="space-y-4">
            <p className="text-sm">
              Chofer:{" "}
              <strong>
                {driver.first_name} {driver.paternal_surname}
              </strong>{" "}
              ({driver.driver_code})
            </p>

            <div className="space-y-3 rounded-lg border border-brand-blue/15 bg-card/80 p-4">
              <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                <Users className="w-3 h-3" /> Pasajeros vinculados (acompañantes)
              </p>

              {companionSummary.map(({ category, count }) => (
                <div key={category} className="flex w-full min-w-0 items-center gap-2">
                  <Select
                    value={category}
                    onValueChange={(v) =>
                      setCompanions((arr) =>
                        arr.map((existing) => (existing === category ? (v as Category) : existing)),
                      )
                    }
                  >
                    <SelectTrigger className="min-w-0 flex-1">
                      <SelectValue className="min-w-0 flex-1 truncate text-left" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.filter(
                        (option) => option === category || !companions.includes(option),
                      ).map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {nombre(opt)} · Bs {precio(opt).toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="outline"
                    className="shrink-0 border-brand-blue/20 text-brand-blue hover:bg-brand-blue-light"
                    aria-label={`Agregar pasajero ${nombre(category)}`}
                    disabled={tickets >= 10}
                    onClick={() =>
                      setCompanions((arr) => (arr.length >= 9 ? arr : [...arr, category]))
                    }
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <span
                    className="min-w-4 shrink-0 text-center text-sm"
                    aria-label={`${count} pasajeros`}
                  >
                    {count}
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="shrink-0 border-brand-blue/20 text-brand-blue hover:bg-brand-blue-light"
                    aria-label={`Quitar pasajero ${nombre(category)}`}
                    onClick={() =>
                      setCompanions((arr) => {
                        const index = arr.indexOf(category);
                        return index < 0 ? arr : arr.filter((_, i) => i !== index);
                      })
                    }
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                </div>
              ))}

              <Button
                variant="outline"
                className="w-full border-brand-blue text-brand-blue hover:bg-brand-blue-light"
                disabled={tickets >= 10}
                onClick={addCompanion}
              >
                <Plus className="w-4 h-4 mr-2" /> Agregar acompañante
              </Button>

              <div className="mt-1 text-sm space-y-1">
                <div className="flex justify-between">
                  <span>{nombre(profile.category ?? "general")}</span>
                  <span>Bs {basePrice.toFixed(2)}</span>
                </div>
                {companionSummary.length > 0 && (
                  <>
                    <p className="pt-1 text-xs font-semibold text-muted-foreground">Acompañantes</p>
                    {companionSummary.map(({ category, count }) => (
                      <div key={category} className="flex justify-between">
                        <span>
                          {count} {nombre(category)}
                        </span>
                        <span>Bs {(precio(category) * count).toFixed(2)}</span>
                      </div>
                    ))}
                  </>
                )}
                <div className="flex justify-between font-bold border-t pt-1">
                  <span>
                    Total ({tickets} pasaje{tickets > 1 ? "s" : ""})
                  </span>
                  <span>Bs {total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {balance < total && (
              <p className="text-sm text-destructive text-center">
                Saldo insuficiente. Carga saldo para continuar.
              </p>
            )}

            <Button
              onClick={confirmPayment}
              disabled={busy || balance < total}
              className="h-12 w-full bg-brand-blue text-base text-white hover:bg-brand-blue-dark focus-visible:ring-brand-orange"
            >
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar Pago (Bs {total.toFixed(2)})
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setDriver(null);
                setCode("");
                setCompanions([]);
              }}
            >
              Cancelar
            </Button>
          </div>
        )}
      </Card>

      {/* 2. Billetera virtual */}
      <Card className="mt-4 border-brand-blue/15 bg-gradient-to-br from-brand-blue-light to-brand-orange-light p-5 shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Wallet className="w-4 h-4" /> Saldo Pago Justo
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-brand-blue hover:bg-brand-orange-light hover:text-brand-blue-dark"
            aria-label={hideBalance ? "Mostrar saldo" : "Ocultar saldo"}
            onClick={() => setHideBalance((v) => !v)}
          >
            {hideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
        <div className="text-4xl font-black my-2">
          {hideBalance ? "••••••" : `Bs ${balance.toFixed(2)}`}
        </div>
        <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
          <DialogTrigger asChild>
            <Button className="w-full bg-brand-blue text-white hover:bg-brand-blue-dark focus-visible:ring-brand-orange">
              <Plus className="w-4 h-4 mr-2" /> Cargar Saldo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-full sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Cargar saldo</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Monto (Bs)</Label>
                <Input
                  type="number"
                  min={1}
                  step="0.5"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                {[10, 20, 50].map((v) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1 border-brand-blue/20 text-brand-blue hover:bg-brand-blue-light"
                    onClick={() => setTopupAmount(String(v))}
                  >
                    Bs {v}
                  </Button>
                ))}
              </div>
              <div className="rounded-lg border border-brand-blue/15 bg-white p-3 text-center">
                {topupQr ? (
                  <img src={topupQr} alt="QR de recarga" className="mx-auto w-44 h-44" />
                ) : (
                  <QrCode className="w-24 h-24 mx-auto text-muted-foreground" />
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Escanea con Yape / Tigo Money / Banca Móvil
                </p>
              </div>
              <Button
                className="w-full bg-brand-blue text-white hover:bg-brand-blue-dark focus-visible:ring-brand-orange"
                onClick={doTopup}
                disabled={topupBusy}
              >
                {topupBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Simular pago y
                acreditar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>

      <Card className="mt-4 border-brand-blue/15 p-4 shadow-md">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <History className="w-4 h-4" /> Mis transacciones
          </h3>
          <div className="flex items-center gap-1">
            <Select
              value={historyLimit}
              onValueChange={(value) => {
                if (value === "5" || value === "10" || value === "20" || value === "all") {
                  setHistoryLimit(value);
                }
              }}
            >
              <SelectTrigger className="h-8 w-[128px] text-xs" aria-label="Cantidad de transacciones">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Últimas 5</SelectItem>
                <SelectItem value="10">Últimas 10</SelectItem>
                <SelectItem value="20">Últimas 20</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-brand-blue hover:bg-brand-orange-light hover:text-brand-blue-dark"
              aria-label={hideAmounts ? "Mostrar montos" : "Ocultar montos"}
              onClick={() => setHideAmounts((v) => !v)}
            >
              {hideAmounts ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <div className="divide-y text-sm">
          {history.map((t) => (
            <div key={t.id} className="py-2">
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1 sm:flex sm:justify-between">
                <span className="font-mono">{t.verification_code}</span>
                <span>
                  {Number(t.tickets ?? 1)} pasaje{Number(t.tickets ?? 1) > 1 ? "s" : ""}
                </span>
                <span className="col-start-1 row-start-2 font-semibold tabular-nums sm:row-auto">
                  {hideAmounts ? "••••" : `Bs ${Number(t.amount ?? 0).toFixed(2)}`}
                </span>
                <span
                  className="col-span-2 row-start-2 min-w-0 truncate text-xs text-muted-foreground sm:row-auto"
                  title={new Date(t.created_at).toLocaleString()}
                >
                  {new Date(t.created_at).toLocaleString()}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="col-start-3 row-start-1 h-7 w-7 shrink-0 border-brand-blue/20 text-brand-blue hover:bg-brand-blue-light sm:row-auto"
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
                <div className="space-y-3 pl-1">
                  <FareBreakdown transaction={t} nombre={nombre} hideAmounts={hideAmounts} />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                {typeof t.rating === "number" ? (
                  <div className="w-full space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Calificaste al chofer con {t.rating} de 5 estrellas
                    </p>
                    {!!t.selected_comments?.length && (
                      <div className="flex flex-wrap gap-1">
                        {t.selected_comments.map((reason) => (
                          <span
                            key={reason}
                            className="rounded-full bg-brand-blue-light px-2 py-1 text-xs text-brand-blue-dark"
                          >
                            {getRatingReasonLabel(reason) ?? reason}
                          </span>
                        ))}
                      </div>
                    )}
                    {t.comment && (
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {t.comment}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="w-full space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">Califica al chofer</p>
                      <StarRatingInput
                        value={ratingSelections[t.id] ?? 0}
                        onChange={(rating) => {
                          setRatingSelections((current) => ({ ...current, [t.id]: rating }));
                          const allowedReasons = new Set<string>(
                            getRatingReasons(rating, t.id).map((reason) => reason.value),
                          );
                          setRatingReasonSelections((current) => ({
                            ...current,
                            [t.id]: (current[t.id] ?? []).filter((reason) =>
                              allowedReasons.has(reason),
                            ),
                          }));
                        }}
                        disabled={ratingSavingId === t.id}
                      />
                    </div>
                    {!!ratingSelections[t.id] && (
                      <>
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            {ratingSelections[t.id] === 5
                              ? "¿Qué aspectos destacas?"
                              : ratingSelections[t.id] >= 4
                                ? "¿Qué aspectos podrían mejorar?"
                                : "¿Qué aspectos salieron bien o podrían mejorar?"}
                          </p>
                          {getRatingReasons(ratingSelections[t.id], t.id).map((reason) => {
                            const selected = (
                              ratingReasonSelections[t.id] ?? []
                            ).includes(reason.value);
                            return (
                              <Label
                                key={reason.value}
                                className="flex cursor-pointer items-center gap-2 text-sm font-normal"
                              >
                                <Checkbox
                                  checked={selected}
                                  disabled={ratingSavingId === t.id}
                                  onCheckedChange={(checked) =>
                                    setRatingReasonSelections((current) => {
                                      const selectedReasons = current[t.id] ?? [];
                                      return {
                                        ...current,
                                        [t.id]:
                                          checked === true
                                            ? [...selectedReasons, reason.value]
                                            : selectedReasons.filter(
                                                (item) => item !== reason.value,
                                              ),
                                      };
                                    })
                                  }
                                />
                                {reason.label}
                              </Label>
                            );
                          })}
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`rating-comment-${t.id}`} className="text-sm">
                            Comentario (opcional)
                          </Label>
                          <Textarea
                            id={`rating-comment-${t.id}`}
                            value={ratingComments[t.id] ?? ""}
                            onChange={(event) =>
                              setRatingComments((current) => ({
                                ...current,
                                [t.id]: event.target.value,
                              }))
                            }
                            maxLength={500}
                            rows={3}
                            placeholder="Cuéntanos más sobre tu experiencia"
                            disabled={ratingSavingId === t.id}
                          />
                          <p className="text-right text-xs text-muted-foreground">
                            {(ratingComments[t.id] ?? "").length}/500
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="bg-brand-blue text-white hover:bg-brand-blue-dark"
                          disabled={ratingSavingId === t.id}
                          onClick={() => void saveRating(t)}
                        >
                          {ratingSavingId === t.id && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Enviar calificación
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="ml-2 border-brand-blue/20 text-brand-blue hover:bg-brand-blue-light"
                          disabled={ratingSavingId === t.id}
                          onClick={() => {
                            setRatingSelections((current) => {
                              const next = { ...current };
                              delete next[t.id];
                              return next;
                            });
                            setRatingReasonSelections((current) => {
                              const next = { ...current };
                              delete next[t.id];
                              return next;
                            });
                            setRatingComments((current) => {
                              const next = { ...current };
                              delete next[t.id];
                              return next;
                            });
                          }}
                        >
                          Cancelar
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
                </div>
              )}
            </div>
          ))}
          {history.length === 0 && (
            <p className="text-muted-foreground py-3">Aún no tienes transacciones.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
