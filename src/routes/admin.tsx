import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useSession, type Profile } from "@/hooks/use-session";
import { getSignedUrl } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  LogOut,
  Users,
  Bus,
  Shield,
  BarChart3,
  CheckCircle2,
  XCircle,
  Ban,
  Star,
  Menu,
  Receipt,
  MapPin,
  Download,
  FileText,
  DollarSign,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cleanAccount, formatAccount } from "@/lib/bank";
import { isValidBankAccount } from "@/lib/registration-validation";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { createSupervisor, updateSupervisor, updateSupervisorPassword } from "@/lib/auth.functions";
import { STATUS_LABELS, ALL_CATEGORIES, type Category } from "@/lib/categories";
import { fetchTarifas, tipoForCategory, useTarifas, type Tarifa } from "@/lib/tarifas";
import { useBancos } from "@/lib/catalogs";

export const Route = createFileRoute("/admin")({ ssr: false, component: AdminPage });

type Tab = "drivers" | "passengers" | "supervisors" | "transactions" | "reports" | "tariffs";

const DRIVER_RATING_BUCKETS = [
  { rating: 0.5, field: "rating_0_5_count" },
  { rating: 1, field: "rating_1_count" },
  { rating: 1.5, field: "rating_1_5_count" },
  { rating: 2, field: "rating_2_count" },
  { rating: 2.5, field: "rating_2_5_count" },
  { rating: 3, field: "rating_3_count" },
  { rating: 3.5, field: "rating_3_5_count" },
  { rating: 4, field: "rating_4_count" },
  { rating: 4.5, field: "rating_4_5_count" },
  { rating: 5, field: "rating_5_count" },
] as const;
const DRIVER_RATING_COLORS = [
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#ca8a04",
  "#65a30d",
  "#16a34a",
  "#0d9488",
  "#0284c7",
  "#2563eb",
  "#7c3aed",
];
const DRIVER_RATING_REASONS = [
  { value: "trato_amable", label: "Trato amable" },
  { value: "conduccion_segura", label: "Conducción segura" },
  { value: "cobro_correcto", label: "Cobro correcto" },
  { value: "respeto_pasaje_diferenciado", label: "Respeto al pasaje diferenciado" },
  { value: "vehiculo_buen_estado", label: "Vehículo en buenas condiciones" },
  { value: "trato_mejorable", label: "El trato podría mejorar" },
  { value: "conduccion_puede_mejorar", label: "La conducción podría mejorar" },
  { value: "cobro_puede_mejorar", label: "El cobro podría ser más claro" },
  {
    value: "respeto_pasaje_diferenciado_puede_mejorar",
    label: "Podría mejorar el respeto al pasaje diferenciado",
  },
  { value: "vehiculo_requiere_mejoras", label: "El vehículo podría mejorar" },
];

type DriverRatingStats = {
  totalRatings: number;
  averageRating: number | null;
  ratedDrivers: number;
  buckets: { rating: number; count: number; percentage: number }[];
};

type IndividualDriverRatingStats = {
  totalRatings: number;
  averageRating: number | null;
  reasons: { value: string; label: string; count: number; percentage: number }[];
  comments: { rating: number; comment: string; createdAt: string }[];
};

function isJsonRecord(value: Json): value is { [key: string]: Json | undefined } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseDriverRatingComments(value: Json | null) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isJsonRecord(entry)) return [];
    const comment = typeof entry.comment === "string" ? entry.comment.trim() : "";
    const rating = typeof entry.rating === "number" ? entry.rating : Number(entry.rating);
    if (!comment || !Number.isFinite(rating)) return [];
    return [
      {
        rating,
        comment,
        createdAt: typeof entry.created_at === "string" ? entry.created_at : "",
      },
    ];
  });
}

function normalizeProfileStatus(status?: string | null): Profile["status"] {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();

  switch (normalized) {
    case "pending":
      return "pending";
    case "rejected":
    case "rechazado":
    case "rechazada":
      return "rejected";
    case "suspended":
      return "suspended";
    default:
      return "active";
  }
}

function AdminPage() {
  const { profile, loading, refresh } = useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("drivers");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!profile) navigate({ to: "/" });
    else if (profile.status === "suspended") {
      toast.error("Tu cuenta está suspendida. Contacta al administrador.");
      supabase.auth.signOut();
      navigate({ to: "/" });
    } else if (profile.role !== "admin" && profile.role !== "supervisor") navigate({ to: "/" });
  }, [loading, profile, navigate]);

  if (loading || !profile) return <div className="p-8">Cargando...</div>;
  const isAdmin = profile.role === "admin";

  const nav = (
    <>
      <NavBtn
        active={tab === "drivers"}
        onClick={() => {
          setTab("drivers");
          setDrawerOpen(false);
        }}
        icon={<Bus className="w-4 h-4" />}
      >
        Choferes
      </NavBtn>
      <NavBtn
        active={tab === "passengers"}
        onClick={() => {
          setTab("passengers");
          setDrawerOpen(false);
        }}
        icon={<Users className="w-4 h-4" />}
      >
        Pasajeros
      </NavBtn>
      {isAdmin && (
        <NavBtn
          active={tab === "supervisors"}
          onClick={() => {
            setTab("supervisors");
            setDrawerOpen(false);
          }}
          icon={<Shield className="w-4 h-4" />}
        >
          Supervisores
        </NavBtn>
      )}
      <NavBtn
        active={tab === "transactions"}
        onClick={() => {
          setTab("transactions");
          setDrawerOpen(false);
        }}
        icon={<Receipt className="w-4 h-4" />}
      >
        Reportes
      </NavBtn>
      <NavBtn
        active={tab === "reports"}
        onClick={() => {
          setTab("reports");
          setDrawerOpen(false);
        }}
        icon={<BarChart3 className="w-4 h-4" />}
      >
        Denuncias
      </NavBtn>
      {isAdmin && (
        <NavBtn
          active={tab === "tariffs"}
          onClick={() => {
            setTab("tariffs");
            setDrawerOpen(false);
          }}
          icon={<DollarSign className="w-4 h-4" />}
        >
          Tarifas
        </NavBtn>
      )}
    </>
  );

  const brandBlock = (
    <div className="border-b border-white/15 p-4">
      <div className="font-bold text-lg text-white">QR Pago Justo</div>
      <div className="text-xs opacity-70">{isAdmin ? "Administrador" : "Supervisor"}</div>
    </div>
  );

  const signOut = (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        navigate({ to: "/" });
      }}
      className="w-full flex items-center gap-2 rounded px-3 py-2 text-sm text-white hover:bg-white/10"
    >
      <LogOut className="w-4 h-4" /> Cerrar sesión
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-blue-light/40 via-background to-brand-orange-light/30 md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-brand-blue-dark text-white md:flex">
        {brandBlock}
        <nav className="flex-1 p-2 space-y-1">{nav}</nav>
        <div className="border-t border-white/15 p-2">{signOut}</div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex items-center justify-between bg-brand-blue-dark p-3 text-white md:hidden">
        <div className="font-bold">QR Pago Justo</div>
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 bg-brand-blue-dark p-0 text-white">
            {brandBlock}
            <nav className="flex-1 p-2 space-y-1">{nav}</nav>
            <div className="border-t border-white/15 p-2">{signOut}</div>
          </SheetContent>
        </Sheet>
      </div>

      <main className="max-w-full flex-1 overflow-auto p-4 sm:p-6">
        {tab === "drivers" && <UserTable role="driver" onChange={refresh} />}
        {tab === "passengers" && <UserTable role="passenger" onChange={refresh} />}
        {tab === "supervisors" && isAdmin && <UserTable role="supervisor" onChange={refresh} />}
        {tab === "transactions" && <TransactionsPanel />}
        {tab === "reports" && <ReportsPanel />}
        {tab === "tariffs" && isAdmin && <TariffsPanel />}
      </main>
    </div>
  );
}

function NavBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition ${
        active
          ? "bg-brand-orange text-brand-ink font-semibold"
          : "text-white/90 hover:bg-white/10 hover:text-white"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function UserTable({
  role,
  onChange,
}: {
  role: "driver" | "passenger" | "supervisor";
  onChange: () => void;
}) {
  const isSupervisors = role === "supervisor";
  const [subtab, setSubtab] = useState<"pending" | "active" | "suspendedRejected">(
    isSupervisors ? "active" : "pending",
  );
  const [rows, setRows] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [driverRatingStatsOpen, setDriverRatingStatsOpen] = useState(false);
  const [driverRatingStatsLoading, setDriverRatingStatsLoading] = useState(false);
  const [driverRatingStatsError, setDriverRatingStatsError] = useState("");
  const [driverRatingStats, setDriverRatingStats] = useState<DriverRatingStats | null>(null);
  const [selectedRatingDriver, setSelectedRatingDriver] = useState<Profile | null>(null);
  const [individualRatingStatsLoading, setIndividualRatingStatsLoading] = useState(false);
  const [individualRatingStatsError, setIndividualRatingStatsError] = useState("");
  const [individualRatingStats, setIndividualRatingStats] =
    useState<IndividualDriverRatingStats | null>(null);
  const [overrideCategory, setOverrideCategory] = useState<Category | "">("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankName, setBankName] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const { precio, nombre } = useTarifas();
  const { bancos } = useBancos();

  async function load() {
    let data: Profile[] | null = null;

    if (isSupervisors) {
      const { data: supervisorRows } = await supabase
        .from("admins_supervisors")
        .select("*")
        .eq("role", "supervisor")
        .order("created_at", { ascending: false });

      data = (supervisorRows ?? []).map((row) => ({
        id: row.id,
        role: "supervisor",
        status: normalizeProfileStatus(row.status),
        first_name: row.first_name,
        paternal_surname: row.paternal_surname,
        maternal_surname: null,
        ci_number: null,
        birthdate: null,
        phone: row.phone,
        email: row.email,
        category: null,
        driver_code: null,
        ci_front_url: null,
        ci_back_url: null,
        selfie_url: null,
        license_url: null,
        extra_doc_url: null,
        qr_general_url: null,
        qr_primaria_url: null,
        qr_secundaria_url: null,
        qr_adulto_url: null,
        bank_account: null,
        bank_name: null,
        transport_line: null,
        union_doc_url: null,
        rejection_reason: null,
        resubmission_count: 0,
        balance: 0,
      }));
    } else {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", role)
        .order("created_at", { ascending: false });

      data = (profileRows as Profile[] | null) ?? [];
    }

    const normalizedRows = (data ?? []).map((row) => ({
      ...row,
      status: normalizeProfileStatus(row.status),
    }));

    setRows(normalizedRows);
  }
  useEffect(() => {
    load();
  }, [role]);

  async function openDriverRatingStats() {
    setDriverRatingStatsOpen(true);
    setDriverRatingStatsLoading(true);
    setDriverRatingStatsError("");
    try {
      const { data, error } = await supabase.from("driver_rating_report_summary").select("*");
      if (error) throw new Error(error.message);

      const buckets = DRIVER_RATING_BUCKETS.map(({ rating, field }) => ({
        rating,
        count: (data ?? []).reduce((total, row) => total + Number(row[field] ?? 0), 0),
      }));
      const totalRatings = buckets.reduce((total, bucket) => total + bucket.count, 0);
      const ratingPoints = buckets.reduce(
        (total, bucket) => total + bucket.rating * bucket.count,
        0,
      );
      setDriverRatingStats({
        totalRatings,
        averageRating: totalRatings ? ratingPoints / totalRatings : null,
        ratedDrivers: (data ?? []).filter((row) => Number(row.rating_count ?? 0) > 0).length,
        buckets: buckets.map((bucket) => ({
          ...bucket,
          percentage: totalRatings ? (bucket.count / totalRatings) * 100 : 0,
        })),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudieron cargar las calificaciones";
      setDriverRatingStatsError(message);
      toast.error(message);
    } finally {
      setDriverRatingStatsLoading(false);
    }
  }

  async function openIndividualDriverRatings(driver: Profile) {
    setSelectedRatingDriver(driver);
    setIndividualRatingStatsLoading(true);
    setIndividualRatingStatsError("");
    setIndividualRatingStats(null);
    try {
      const [summaryResult, commentsResult] = await Promise.all([
        supabase
          .from("driver_rating_report_summary")
          .select("rating_count, average_rating, selected_reason_counts")
          .eq("driver_id", driver.id)
          .maybeSingle(),
        supabase
          .from("driver_rating_report_comments")
          .select("comments")
          .eq("driver_id", driver.id)
          .maybeSingle(),
      ]);
      if (summaryResult.error) throw new Error(summaryResult.error.message);
      if (commentsResult.error) throw new Error(commentsResult.error.message);

      const totalRatings = Number(summaryResult.data?.rating_count ?? 0);
      const rawReasonCounts = summaryResult.data?.selected_reason_counts;
      const reasonCounts = rawReasonCounts && isJsonRecord(rawReasonCounts) ? rawReasonCounts : {};
      setIndividualRatingStats({
        totalRatings,
        averageRating:
          summaryResult.data?.average_rating === null ||
          summaryResult.data?.average_rating === undefined
            ? null
            : Number(summaryResult.data.average_rating),
        reasons: DRIVER_RATING_REASONS.map((reason) => {
          const count = Number(reasonCounts[reason.value] ?? 0);
          return {
            ...reason,
            count,
            percentage: totalRatings ? (count / totalRatings) * 100 : 0,
          };
        }),
        comments: parseDriverRatingComments(commentsResult.data?.comments ?? null),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudieron cargar las calificaciones";
      setIndividualRatingStatsError(message);
      toast.error(message);
    } finally {
      setIndividualRatingStatsLoading(false);
    }
  }

  function exportDriverRatingStats() {
    if (!driverRatingStats) return;
    try {
      const summarySheet = XLSX.utils.json_to_sheet([
        {
          "Total de calificaciones": driverRatingStats.totalRatings,
          "Promedio general": driverRatingStats.averageRating
            ? Number(driverRatingStats.averageRating.toFixed(2))
            : "Sin calificaciones",
          "Choferes calificados": driverRatingStats.ratedDrivers,
        },
      ]);
      const distributionSheet = XLSX.utils.json_to_sheet(
        driverRatingStats.buckets.map((bucket) => ({
          Calificación: bucket.rating,
          Total: bucket.count,
          Porcentaje: bucket.percentage / 100,
        })),
      );
      for (let row = 2; row <= driverRatingStats.buckets.length + 1; row += 1) {
        const percentageCell = distributionSheet[`C${row}`];
        if (percentageCell) percentageCell.z = "0.00%";
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen");
      XLSX.utils.book_append_sheet(workbook, distributionSheet, "Calificaciones");
      XLSX.writeFile(workbook, "estadisticas-calificaciones-choferes.xlsx");
      toast.success("Estadísticas exportadas a Excel");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo exportar las estadísticas a Excel",
      );
    }
  }

  async function downloadDriverRatingImage() {
    const svg = document.getElementById("driver-rating-chart");
    if (!(svg instanceof SVGSVGElement)) {
      toast.error("No se encontró la gráfica de calificaciones");
      return;
    }

    const imageUrl = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svg)], {
        type: "image/svg+xml;charset=utf-8",
      }),
    );
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("No se pudo preparar la gráfica"));
        image.src = imageUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = svg.viewBox.baseVal.width;
      canvas.height = svg.viewBox.baseVal.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo crear la imagen para descargar");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!png) throw new Error("No se pudo generar el archivo PNG");

      const downloadUrl = URL.createObjectURL(png);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "estadisticas-calificaciones-choferes.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      toast.success("Imagen descargada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo descargar la gráfica");
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  useEffect(() => {
    setOverrideCategory((selected?.category as Category | null) ?? "");
    setBankAccount(cleanAccount(selected?.bank_account ?? ""));
    setBankName(selected?.bank_name ?? "");
    setRejectionReason(selected?.rejection_reason ?? "");
  }, [selected]);

  async function saveBankAccount() {
    if (!selected) return;
    if (bankAccount && !isValidBankAccount(bankAccount))
      return toast.error("La cuenta solo puede contener números y guion medio");
    const { error } = await supabase
      .from("profiles")
      .update({ bank_account: cleanAccount(bankAccount), bank_name: bankName || null })
      .eq("id", selected.id);
    if (error) return toast.error(error.message);
    toast.success("Datos bancarios actualizados");
    load();
  }

  const filtered = isSupervisors
    ? rows
    : rows.filter((row) => {
        if (subtab === "pending") return row.status === "pending";
        if (subtab === "active") return row.status === "active";
        return row.status === "suspended" || row.status === "rejected";
      });
  const maxDriverRatingCount = Math.max(
    1,
    ...(driverRatingStats?.buckets.map((bucket) => bucket.count) ?? []),
  );

  async function saveCategory() {
    if (!selected || !overrideCategory) return;
    const { error } = await supabase
      .from("profiles")
      .update({ category: overrideCategory })
      .eq("id", selected.id);
    if (error) return toast.error(error.message);
    toast.success("Categoría actualizada");
    load();
  }

  async function updateStatus(id: string, status: Profile["status"]) {
    // Guarda la categoría corregida junto con el cambio de estado
    const updates: {
      status: Profile["status"];
      category?: Category;
      rejection_reason?: string | null;
    } = { status };
    if (selected && overrideCategory && overrideCategory !== selected.category) {
      updates.category = overrideCategory;
    }
    if (status === "rejected") {
      if (!rejectionReason.trim()) return toast.error("Escribe el motivo del rechazo");
      updates.rejection_reason = rejectionReason.trim();
    }
    if (status === "active") updates.rejection_reason = null;
    const { error } = await supabase.from("profiles").update(updates).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Estado actualizado");
    setSelected(null);
    load();
    onChange();
  }

  return (
    <Card className="max-w-full overflow-hidden border-brand-blue/15 p-4 shadow-md">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold capitalize">
          {role === "driver" ? "Choferes" : role === "passenger" ? "Pasajeros" : "Supervisores"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {role === "driver" && (
            <Button
              variant="outline"
              className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
              onClick={openDriverRatingStats}
              disabled={driverRatingStatsLoading}
            >
              <BarChart3 className="mr-1 h-4 w-4" /> Estadísticas de calificaciones
            </Button>
          )}
          {isSupervisors && <AddSupervisor onCreated={load} />}
        </div>
      </div>
      <Tabs
        value={subtab}
        onValueChange={(v) => setSubtab(v as "pending" | "active" | "suspendedRejected")}
      >
        {!isSupervisors && (
          <TabsList className="h-auto flex-wrap bg-brand-blue-light/70">
            <TabsTrigger
              value="pending"
              className="text-brand-blue-dark data-[state=active]:bg-brand-blue data-[state=active]:text-white"
            >
              Pendientes ({rows.filter((r) => r.status === "pending").length})
            </TabsTrigger>
            <TabsTrigger
              value="active"
              className="text-brand-blue-dark data-[state=active]:bg-brand-blue data-[state=active]:text-white"
            >
              Inscritos / Activos
            </TabsTrigger>
            <TabsTrigger
              value="suspendedRejected"
              className="text-brand-blue-dark data-[state=active]:bg-brand-blue data-[state=active]:text-white"
            >
              Suspendidos / Rechazados (
              {rows.filter((row) => row.status === "suspended" || row.status === "rejected").length}
              )
            </TabsTrigger>
          </TabsList>
        )}
        <TabsContent value={subtab} className="mt-3">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground p-4">Sin registros.</p>
          )}
          <div className="divide-y overflow-x-auto">
            {filtered.map((r) => (
              <div key={r.id} className="py-3 flex items-center gap-3 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {r.first_name} {r.paternal_surname}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {isSupervisors ? (
                      <>
                        {r.email} · {r.phone || "Sin celular"}
                      </>
                    ) : (
                      <>
                        CI: {r.ci_number} · {r.phone}{" "}
                        {r.driver_code && `· Código: ${r.driver_code}`}
                      </>
                    )}
                  </div>
                </div>
                <StatusBadge status={r.status} />
                {role === "driver" && (r.status === "active" || r.status === "suspended") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
                    onClick={() => openIndividualDriverRatings(r)}
                    disabled={individualRatingStatsLoading}
                    aria-label={`Ver calificaciones de ${r.first_name ?? "chofer"}`}
                  >
                    <Star className="mr-1 h-4 w-4" /> Calificaciones
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
                  onClick={() => setSelected(r)}
                >
                  {isSupervisors ? "Editar" : "Revisar"}
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={driverRatingStatsOpen} onOpenChange={setDriverRatingStatsOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-4xl overflow-y-auto border-brand-blue/20">
          <DialogHeader>
            <DialogTitle>Estadísticas de calificaciones de choferes</DialogTitle>
          </DialogHeader>
          {driverRatingStatsLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Cargando estadísticas...
            </p>
          ) : driverRatingStatsError ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{driverRatingStatsError}</p>
              <Button variant="outline" onClick={openDriverRatingStats}>
                Reintentar
              </Button>
            </div>
          ) : driverRatingStats ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Calificaciones recibidas</p>
                  <p className="text-xl font-semibold">{driverRatingStats.totalRatings}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Promedio general</p>
                  <p className="text-xl font-semibold">
                    {driverRatingStats.averageRating?.toFixed(2) ?? "—"} / 5
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Choferes calificados</p>
                  <p className="text-xl font-semibold">{driverRatingStats.ratedDrivers}</p>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
                  onClick={exportDriverRatingStats}
                >
                  <Download className="mr-1 h-4 w-4" /> Descargar Excel
                </Button>
                <Button
                  variant="outline"
                  className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
                  onClick={downloadDriverRatingImage}
                  disabled={driverRatingStats.totalRatings === 0}
                >
                  <Download className="mr-1 h-4 w-4" /> Descargar imagen
                </Button>
              </div>
              {driverRatingStats.totalRatings > 0 ? (
                <div className="overflow-x-auto">
                  <svg
                    id="driver-rating-chart"
                    xmlns="http://www.w3.org/2000/svg"
                    width="760"
                    height="360"
                    viewBox="0 0 760 360"
                    role="img"
                    aria-label="Distribución total y porcentual de calificaciones de choferes"
                    className="block min-w-[700px] bg-white"
                  >
                    <rect width="760" height="360" fill="#ffffff" />
                    <text x="30" y="28" fontSize="18" fontWeight="600" fill="#111827">
                      Calificaciones de usuarios a choferes
                    </text>
                    <text x="30" y="50" fontSize="12" fill="#475569">
                      Total: {driverRatingStats.totalRatings} · Promedio:{" "}
                      {driverRatingStats.averageRating?.toFixed(2)} / 5
                    </text>
                    <line x1="35" y1="280" x2="735" y2="280" stroke="#cbd5e1" />
                    {driverRatingStats.buckets.map((bucket, index) => {
                      const slotWidth = 70;
                      const x = 35 + index * slotWidth;
                      const barHeight = (bucket.count / maxDriverRatingCount) * 190;
                      const y = 270 - barHeight;
                      return (
                        <g key={bucket.rating}>
                          <title>
                            {bucket.rating} estrellas: {bucket.count} (
                            {bucket.percentage.toFixed(1)}%)
                          </title>
                          <rect
                            x={x + 14}
                            y={y}
                            width="42"
                            height={barHeight}
                            rx="4"
                            fill={DRIVER_RATING_COLORS[index]}
                          />
                          <text
                            x={x + 35}
                            y={y - 8}
                            textAnchor="middle"
                            fontSize="12"
                            fill="#111827"
                          >
                            {bucket.count}
                          </text>
                          <text x={x + 35} y="300" textAnchor="middle" fontSize="11" fill="#475569">
                            {bucket.percentage.toFixed(1)}%
                          </text>
                          <text x={x + 35} y="322" textAnchor="middle" fontSize="12" fill="#111827">
                            {bucket.rating.toLocaleString("es")}★
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <p className="rounded-md border p-4 text-center text-sm text-muted-foreground">
                  Todavía no hay calificaciones registradas.
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3">Calificación</th>
                      <th className="py-2 pr-3">Total</th>
                      <th className="py-2">Porcentaje</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {driverRatingStats.buckets.map((bucket) => (
                      <tr key={bucket.rating}>
                        <td className="py-2 pr-3">
                          {bucket.rating.toLocaleString("es")} estrellas
                        </td>
                        <td className="py-2 pr-3">{bucket.count}</td>
                        <td className="py-2">{bucket.percentage.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedRatingDriver !== null}
        onOpenChange={(open) => !open && setSelectedRatingDriver(null)}
      >
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-3xl overflow-y-auto border-brand-blue/20">
          <DialogHeader>
            <DialogTitle>
              Calificaciones de {selectedRatingDriver?.first_name}{" "}
              {selectedRatingDriver?.paternal_surname}
            </DialogTitle>
          </DialogHeader>
          {individualRatingStatsLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Cargando calificaciones...
            </p>
          ) : individualRatingStatsError ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{individualRatingStatsError}</p>
              {selectedRatingDriver && (
                <Button
                  variant="outline"
                  onClick={() => openIndividualDriverRatings(selectedRatingDriver)}
                >
                  Reintentar
                </Button>
              )}
            </div>
          ) : individualRatingStats ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Calificaciones recibidas</p>
                  <p className="text-xl font-semibold">{individualRatingStats.totalRatings}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Promedio en estrellas</p>
                  <p className="flex items-center gap-1 text-xl font-semibold">
                    <Star className="h-5 w-5 fill-current text-amber-500" />
                    {individualRatingStats.averageRating?.toFixed(2) ?? "—"} / 5
                  </p>
                </div>
              </div>
              {individualRatingStats.totalRatings > 0 ? (
                <section className="space-y-2">
                  <div>
                    <h3 className="font-semibold">Respuestas predeterminadas</h3>
                    <p className="text-xs text-muted-foreground">
                      El porcentaje se calcula sobre el total de calificaciones; una persona pudo
                      seleccionar varias respuestas.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                          <th className="py-2 pr-3">Respuesta</th>
                          <th className="py-2 pr-3">Veces recibida</th>
                          <th className="py-2">Porcentaje</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {individualRatingStats.reasons.map((reason) => (
                          <tr key={reason.value}>
                            <td className="py-2 pr-3">{reason.label}</td>
                            <td className="py-2 pr-3">{reason.count}</td>
                            <td className="py-2">{reason.percentage.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <p className="rounded-md border p-3 text-sm text-muted-foreground">
                  Este chofer aún no recibió calificaciones.
                </p>
              )}
              <section className="space-y-2">
                <h3 className="font-semibold">Comentarios opcionales</h3>
                {individualRatingStats.comments.length > 0 ? (
                  <div className="space-y-2">
                    {individualRatingStats.comments.map((comment, index) => (
                      <article
                        key={`${comment.createdAt}-${index}`}
                        className="rounded-md border p-3"
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
                            {comment.rating.toLocaleString("es")} / 5
                          </span>
                          {comment.createdAt && (
                            <time dateTime={comment.createdAt}>
                              {new Date(comment.createdAt).toLocaleString("es")}
                            </time>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{comment.comment}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border p-3 text-sm text-muted-foreground">
                    No hay comentarios opcionales.
                  </p>
                )}
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-3xl overflow-y-auto border-brand-blue/20">
          <DialogHeader>
            <DialogTitle>
              {selected?.role === "supervisor"
                ? "Editar supervisor"
                : "Revisión de verificación de identidad"}
            </DialogTitle>
          </DialogHeader>
          {selected &&
            (selected.role === "supervisor" ? (
              <SupervisorEditor
                supervisor={selected}
                onSaved={() => {
                  setSelected(null);
                  load();
                  onChange();
                }}
              />
            ) : (
              <div className="space-y-4">
                <div className="text-sm space-y-1">
                  <p>
                    <strong>Nombre:</strong> {selected.first_name} {selected.paternal_surname}{" "}
                    {selected.maternal_surname}
                  </p>
                  <p>
                    <strong>CI:</strong> {selected.ci_number} · <strong>Nacimiento:</strong>{" "}
                    {selected.birthdate}
                  </p>
                  <p>
                    <strong>Teléfono:</strong> {selected.phone} · <strong>Email:</strong>{" "}
                    {selected.email}
                  </p>
                  {selected.driver_code && (
                    <p>
                      <strong>Código chofer:</strong> {selected.driver_code}
                    </p>
                  )}
                  {selected.transport_line && (
                    <p>
                      <strong>Línea:</strong> {selected.transport_line}
                    </p>
                  )}
                  {selected.bank_name && (
                    <p>
                      <strong>Banco:</strong> {selected.bank_name}
                    </p>
                  )}
                  {selected.role === "driver" && (
                    <p>
                      <strong>Reenvíos de documentos:</strong> {selected.resubmission_count ?? 0} /
                      3
                    </p>
                  )}
                  <p>
                    <strong>Saldo:</strong> Bs {Number(selected.balance ?? 0).toFixed(2)}
                  </p>
                </div>

                <div className="space-y-2 rounded-md border border-brand-blue/15 p-3">
                  <p className="text-sm font-semibold">Banco y número de cuenta</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select value={bankName} onValueChange={setBankName}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona el banco" />
                      </SelectTrigger>
                      <SelectContent>
                        {bancos.map((b) => (
                          <SelectItem key={b.id} value={b.nombre}>
                            {b.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      inputMode="text"
                      value={bankAccount}
                      onChange={(e) => setBankAccount(cleanAccount(e.target.value))}
                      placeholder="Ej. 104578 o 10-4578"
                    />
                    <Button
                      variant="outline"
                      className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
                      onClick={saveBankAccount}
                      disabled={!bankAccount.trim() || !bankName}
                    >
                      Guardar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatAccount(bankName, bankAccount)}
                  </p>
                </div>

                {selected.role === "passenger" && (
                  <div className="space-y-2 rounded-md border border-brand-blue/15 p-3">
                    <p className="text-sm font-semibold">Modificar categoría de tarifa</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Select
                        value={overrideCategory}
                        onValueChange={(v) => setOverrideCategory(v as Category)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona" />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {nombre(c)} — Bs {precio(c).toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
                        onClick={saveCategory}
                        disabled={!overrideCategory || overrideCategory === selected.category}
                      >
                        Guardar categoría
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Actual: {selected.category ? nombre(selected.category as Category) : "—"}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ImagePreview
                    label="CI Frontal"
                    path={selected.ci_front_url}
                    bucket="kyc-documents"
                  />
                  <ImagePreview
                    label="CI Reverso"
                    path={selected.ci_back_url}
                    bucket="kyc-documents"
                  />
                  <ImagePreview label="Selfie" path={selected.selfie_url} bucket="kyc-documents" />
                  {selected.license_url && (
                    <ImagePreview
                      label="Licencia"
                      path={selected.license_url}
                      bucket="kyc-documents"
                    />
                  )}
                  {selected.union_doc_url && (
                    <ImagePreview
                      label="Credencial de Línea / Sindicato"
                      path={selected.union_doc_url}
                      bucket="kyc-documents"
                    />
                  )}
                  {selected.extra_doc_url && (
                    <ImagePreview
                      label="Documento adicional"
                      path={selected.extra_doc_url}
                      bucket="kyc-documents"
                    />
                  )}
                </div>
                <div className="space-y-2 rounded-md border border-brand-blue/15 p-3">
                  <p className="text-sm font-semibold">Motivo de rechazo</p>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Ej. La foto del CI está borrosa, vuelve a subirla."
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    Obligatorio al rechazar. El usuario lo verá al iniciar sesión.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    onClick={() => updateStatus(selected.id, "active")}
                    className="bg-success text-success-foreground"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Aprobar
                  </Button>
                  <Button variant="outline" onClick={() => updateStatus(selected.id, "rejected")}>
                    <XCircle className="w-4 h-4 mr-1" /> Rechazar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => updateStatus(selected.id, "suspended")}
                  >
                    <Ban className="w-4 h-4 mr-1" /> Suspender
                  </Button>
                </div>
              </div>
            ))}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const CATEGORY_TARIFF_LABELS: Record<Category, string> = {
  general: "General",
  primaria: "Primaria",
  secundaria: "Secundaria",
  universitario: "Universitario",
  adulto_mayor: "Adulto mayor",
  discapacidad: "Persona con discapacidad",
};

function TariffsPanel() {
  const [tariffs, setTariffs] = useState<Tarifa[]>([]);
  const [priceDrafts, setPriceDrafts] = useState<Partial<Record<Category, string>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingCategory, setSavingCategory] = useState<Category | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    fetchTarifas(true)
      .then(({ list }) => {
        if (!active) return;
        setTariffs(list);
        setPriceDrafts(
          Object.fromEntries(
            ALL_CATEGORIES.map((category) => {
              const tarifa = list.find(
                (entry) => entry.tipo.trim().toLowerCase() === tipoForCategory(category),
              );
              return [category, tarifa ? tarifa.precio.toFixed(2) : ""];
            }),
          ),
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : "No se pudieron cargar las tarifas";
        setLoadError(message);
        toast.error(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function saveTariff(category: Category) {
    const rawPrice = priceDrafts[category] ?? "";
    const price = Number(rawPrice);
    if (
      !rawPrice.trim() ||
      !Number.isFinite(price) ||
      price < 0 ||
      price > 99999999.99 ||
      Math.abs(price * 100 - Math.round(price * 100)) > 1e-8
    ) {
      toast.error("Ingresa una tarifa válida con hasta dos decimales");
      return;
    }

    const tipo = tipoForCategory(category);
    const existing = tariffs.find((entry) => entry.tipo.trim().toLowerCase() === tipo);
    setSavingCategory(category);
    try {
      const result = existing
        ? await supabase
            .from("tarifas")
            .update({ precio: price })
            .eq("id", existing.id)
            .select("id, tipo, nombre, precio")
            .single()
        : await supabase
            .from("tarifas")
            .insert({ tipo, nombre: CATEGORY_TARIFF_LABELS[category], precio: price })
            .select("id, tipo, nombre, precio")
            .single();
      if (result.error) throw new Error(result.error.message);

      const savedTariff: Tarifa = { ...result.data, precio: Number(result.data.precio) };
      setTariffs((current) =>
        existing
          ? current.map((entry) => (entry.id === existing.id ? savedTariff : entry))
          : [...current, savedTariff],
      );
      setPriceDrafts((current) => ({ ...current, [category]: savedTariff.precio.toFixed(2) }));

      try {
        const refreshed = await fetchTarifas(true);
        setTariffs(refreshed.list);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "No se pudieron recargar las tarifas";
        toast.error(`La tarifa se guardó, pero no se pudo actualizar la caché: ${message}`);
        return;
      }
      toast.success(`Tarifa de ${CATEGORY_TARIFF_LABELS[category]} actualizada`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la tarifa");
    } finally {
      setSavingCategory(null);
    }
  }

  const tariffRows = ALL_CATEGORIES.map((category) => ({
    category,
    tariff: tariffs.find((entry) => entry.tipo.trim().toLowerCase() === tipoForCategory(category)),
  }));

  return (
    <Card className="max-w-full overflow-hidden border-brand-blue/15 p-4 shadow-md">
      <div className="mb-4">
        <h2 className="text-xl font-bold">Tarifas por categoría</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Modifica los montos vigentes. Los cambios se aplicarán a los próximos pagos.
        </p>
      </div>
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando tarifas...</p>
      ) : loadError ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {tariffRows.map(({ category, tariff }) => {
            const draft = priceDrafts[category] ?? "";
            const parsedPrice = Number(draft);
            const changed = Boolean(draft.trim()) && (!tariff || parsedPrice !== tariff.precio);
            return (
              <section key={category} className="space-y-3 rounded-md border p-4">
                <div>
                  <h3 className="font-semibold">{CATEGORY_TARIFF_LABELS[category]}</h3>
                  <p className="text-xs text-muted-foreground">
                    {tariff ? `Tipo: ${tariff.tipo}` : "Aún no configurada"}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="flex-1 space-y-1 text-sm">
                    <span className="font-medium">Tarifa (Bs)</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="99999999.99"
                      step="0.01"
                      value={draft}
                      onChange={(event) =>
                        setPriceDrafts((current) => ({
                          ...current,
                          [category]: event.target.value,
                        }))
                      }
                      aria-label={`Tarifa en bolivianos para ${CATEGORY_TARIFF_LABELS[category]}`}
                      disabled={savingCategory !== null}
                    />
                  </label>
                  <Button
                    className="bg-brand-orange text-brand-ink hover:bg-brand-orange/90"
                    onClick={() => saveTariff(category)}
                    disabled={
                      !changed ||
                      !Number.isFinite(parsedPrice) ||
                      parsedPrice < 0 ||
                      savingCategory !== null
                    }
                  >
                    {savingCategory === category ? "Guardando..." : "Guardar"}
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function SupervisorEditor({ supervisor, onSaved }: { supervisor: Profile; onSaved: () => void }) {
  const [firstName, setFirstName] = useState(supervisor.first_name ?? "");
  const [surname, setSurname] = useState(supervisor.paternal_surname ?? "");
  const [email, setEmail] = useState(supervisor.email ?? "");
  const [phone, setPhone] = useState(supervisor.phone ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveDetails() {
    if (!firstName.trim() || !email.trim()) {
      return toast.error("El nombre y el correo son obligatorios");
    }
    setSaving(true);
    try {
      await updateSupervisor({
        data: {
          userId: supervisor.id,
          first_name: firstName.trim(),
          paternal_surname: surname.trim(),
          email: email.trim(),
          phone: phone.trim(),
        },
      });
      toast.success("Datos del supervisor actualizados");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron actualizar los datos");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (password.length < 6) return toast.error("La contraseña debe tener al menos 6 caracteres");
    setSaving(true);
    try {
      await updateSupervisorPassword({ data: { userId: supervisor.id, password } });
      setPassword("");
      toast.success("Contraseña actualizada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cambiar la contraseña");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    const currentStatus = normalizeProfileStatus(supervisor.status);
    const nextStatus = currentStatus === "suspended" ? "active" : "suspended";

    if (supervisor.role === "admin") {
      toast.error("No puedes suspender al administrador principal");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("admins_supervisors")
        .update({ status: nextStatus })
        .eq("id", supervisor.id)
        .eq("role", "supervisor");
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(nextStatus === "suspended" ? "Supervisor suspendido" : "Supervisor habilitado");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el estado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Nombre(s)</span>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Apellidos</span>
          <Input value={surname} onChange={(e) => setSurname(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Correo</span>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Número de celular</span>
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
      </div>
      <Button
        onClick={saveDetails}
        disabled={saving}
        className="bg-brand-blue text-white hover:bg-brand-blue-dark"
      >
        Guardar cambios
      </Button>

      <div className="space-y-2 rounded-md border border-brand-blue/15 p-3">
        <p className="text-sm font-semibold">Cambiar contraseña</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="Nueva contraseña (mínimo 6 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            variant="outline"
            className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
            onClick={changePassword}
            disabled={saving || password.length < 6}
          >
            Cambiar contraseña
          </Button>
        </div>
      </div>

      <div className="border-t pt-3">
        <Button
          variant={
            normalizeProfileStatus(supervisor.status) === "suspended" ? "default" : "destructive"
          }
          className={
            normalizeProfileStatus(supervisor.status) === "suspended"
              ? "bg-brand-blue text-white hover:bg-brand-blue-dark"
              : undefined
          }
          onClick={toggleStatus}
          disabled={saving}
        >
          {normalizeProfileStatus(supervisor.status) === "suspended" ? (
            <>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Habilitar
            </>
          ) : (
            <>
              <Ban className="mr-1 h-4 w-4" /> Suspender
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function AddSupervisor({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!email.trim() || password.length < 6 || !firstName.trim())
      return toast.error("Completa correo, nombre y una contraseña de 6+ caracteres");
    setBusy(true);
    try {
      await createSupervisor({
        data: {
          email: email.trim(),
          password,
          first_name: firstName.trim(),
          paternal_surname: surname.trim(),
        },
      });
      toast.success("Supervisor creado");
      setOpen(false);
      setEmail("");
      setPassword("");
      setFirstName("");
      setSurname("");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el supervisor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3">
      <Button
        size="sm"
        className="bg-brand-blue text-white hover:bg-brand-blue-dark"
        onClick={() => setOpen(true)}
      >
        + Agregar Supervisor
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm border-brand-blue/20">
          <DialogHeader>
            <DialogTitle>Nuevo supervisor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Correo electrónico"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              placeholder="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              placeholder="Nombres"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <Input
              placeholder="Apellido paterno"
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
            />
            <Button
              className="w-full bg-brand-blue text-white hover:bg-brand-blue-dark"
              onClick={create}
              disabled={busy}
            >
              Crear supervisor
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: Profile["status"] }) {
  const normalizedStatus = normalizeProfileStatus(status);
  const map = {
    pending: "secondary",
    active: "default",
    rejected: "destructive",
    suspended: "outline",
  } as const;

  return (
    <Badge
      variant={map[normalizedStatus]}
      className={
        normalizedStatus === "active"
          ? "border-transparent bg-brand-blue text-white"
          : normalizedStatus === "suspended"
            ? "border-orange-200 bg-orange-50 text-orange-700"
            : undefined
      }
    >
      {STATUS_LABELS[normalizedStatus] ?? normalizedStatus}
    </Badge>
  );
}

function ImagePreview({
  label,
  path,
  bucket,
}: {
  label: string;
  path: string | null;
  bucket: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    getSignedUrl(supabase, bucket, path)
      .then(setUrl)
      .catch(() => {});
  }, [path, bucket]);
  return (
    <div>
      <p className="text-xs font-medium mb-1">{label}</p>
      {url ? (
        <img src={url} alt={label} className="w-full h-40 object-cover rounded border" />
      ) : (
        <div className="w-full h-40 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground">
          Sin imagen
        </div>
      )}
    </div>
  );
}

type ReportRow = {
  id: string;
  reporter_id: string;
  category: string;
  description: string;
  driver_code: string | null;
  transaction_id: string | null;
  validation_code: string | null;
  reported_user_id: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

const REPORT_CATEGORY_LABELS: Record<string, string> = {
  tarifa_incorrecta: "Cobro incorrecto",
  mala_conducta: "Mala conducta",
  bug_app: "Error en la app",
  otro: "Otro",
};

const REPORT_STATUS_LABELS: Record<string, string> = {
  open: "Abierto",
  reviewing: "En revisión",
  resolved: "Resuelto",
  resuelto: "Resuelto",
  dismissed: "Descartado",
};

function ReportsPanel() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [notes, setNotes] = useState("");
  const [reporterProfile, setReporterProfile] = useState<Profile | null>(null);
  const [reportedProfile, setReportedProfile] = useState<Profile | null>(null);

  async function load() {
    const { data } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setRows((data as ReportRow[]) ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setNotes(selected?.admin_notes ?? "");
    setReporterProfile(null);
    setReportedProfile(null);
    if (!selected) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", selected.reporter_id)
      .maybeSingle()
      .then(({ data }) => setReporterProfile(data as Profile | null));
    if (selected.driver_code) {
      supabase
        .from("profiles")
        .select("*")
        .eq("driver_code", selected.driver_code)
        .maybeSingle()
        .then(({ data }) => setReportedProfile(data as Profile | null));
    }
  }, [selected]);

  async function updateReport(status: string) {
    if (!selected) return;
    const { error } = await supabase
      .from("reports")
      .update({ status, admin_notes: notes })
      .eq("id", selected.id);
    if (error) return toast.error(error.message);
    toast.success("Reporte actualizado");
    setSelected(null);
    load();
  }

  async function suspendUser(id: string) {
    const { error } = await supabase.from("profiles").update({ status: "suspended" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Usuario suspendido");
  }

  return (
    <Card className="max-w-full overflow-hidden border-brand-blue/15 p-4 shadow-md">
      <h2 className="text-xl font-bold mb-3">Reportes de usuarios</h2>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No hay reportes.</p>}
      <div className="divide-y overflow-x-auto">
        {rows.map((r) => (
          <div key={r.id} className="py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                {REPORT_CATEGORY_LABELS[r.category] ?? r.category}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {new Date(r.created_at).toLocaleString()}{" "}
                {r.driver_code && `· Chofer: ${r.driver_code}`}
              </div>
              <p className="text-sm truncate">{r.description}</p>
            </div>
            <Badge
              variant={
                r.status === "open"
                  ? "destructive"
                  : r.status === "resolved" || r.status === "resuelto"
                    ? "default"
                    : "secondary"
              }
            >
              {REPORT_STATUS_LABELS[r.status] ?? r.status}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
              onClick={() => setSelected(r)}
            >
              Ver
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto border-brand-blue/20">
          <DialogHeader>
            <DialogTitle>Detalle del reporte</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div>
                <p>
                  <strong>Categoría:</strong>{" "}
                  {REPORT_CATEGORY_LABELS[selected.category] ?? selected.category}
                </p>
                <p>
                  <strong>Fecha:</strong> {new Date(selected.created_at).toLocaleString()}
                </p>
                <p>
                  <strong>Estado:</strong>{" "}
                  {REPORT_STATUS_LABELS[selected.status] ?? selected.status}
                </p>
                {selected.driver_code && (
                  <p>
                    <strong>Código chofer:</strong> {selected.driver_code}
                  </p>
                )}
                {selected.validation_code && (
                  <p>
                    <strong>Código de validación:</strong> {selected.validation_code}
                  </p>
                )}
              </div>
              <div>
                <p className="font-semibold">Descripción</p>
                <p className="whitespace-pre-wrap">{selected.description}</p>
              </div>

              {reporterProfile && (
                <div className="rounded border border-brand-blue/15 p-2">
                  <p className="text-xs uppercase text-muted-foreground">Reportado por</p>
                  <p>
                    <strong>
                      {reporterProfile.first_name} {reporterProfile.paternal_surname}
                    </strong>{" "}
                    ({reporterProfile.role})
                  </p>
                  <p className="text-xs">
                    {reporterProfile.email} · {reporterProfile.phone}
                  </p>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="mt-2"
                    onClick={() => suspendUser(reporterProfile.id)}
                  >
                    <Ban className="w-3 h-3 mr-1" /> Suspender reportante
                  </Button>
                </div>
              )}
              {reportedProfile && (
                <div className="rounded border border-brand-blue/15 p-2">
                  <p className="text-xs uppercase text-muted-foreground">Chofer reportado</p>
                  <p>
                    <strong>
                      {reportedProfile.first_name} {reportedProfile.paternal_surname}
                    </strong>{" "}
                    — {reportedProfile.driver_code}
                  </p>
                  <p className="text-xs">
                    {reportedProfile.email} · {reportedProfile.phone}
                  </p>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="mt-2"
                    onClick={() => suspendUser(reportedProfile.id)}
                  >
                    <Ban className="w-3 h-3 mr-1" /> Suspender chofer
                  </Button>
                </div>
              )}

              <div>
                <p className="font-semibold">Notas del administrador</p>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => updateReport("reviewing")}
                  variant="outline"
                  className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
                >
                  En revisión
                </Button>
                <Button
                  onClick={() => updateReport("resolved")}
                  className="bg-success text-success-foreground"
                >
                  Resuelto
                </Button>
                <Button
                  onClick={() => updateReport("dismissed")}
                  variant="outline"
                  className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
                >
                  Descartar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

type TxRow = {
  id: string;
  driver_id: string;
  passenger_id: string;
  category: string;
  amount: number;
  tickets: number;
  verification_code: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  fare_breakdown: Json;
};

type TransactionProfile = {
  id: string;
  role: Profile["role"];
  status: Profile["status"];
  first_name: string | null;
  paternal_surname: string | null;
  maternal_surname: string | null;
  category: Profile["category"];
  driver_code: string | null;
  transport_line: string | null;
};

type ReportPeriod = "day" | "week" | "month" | "year";
type ReportBreakdown = "none" | "passenger" | "category" | "driver";
type FareLine = { category: string; kind: string; tickets: number; amount: number };
type PassengerStatusFilter = "active" | "suspended" | "all";
type GraphEntity = "passenger" | "driver";
type GraphStyle = "bar" | "pie";

type TransactionSummary = {
  periodKey: string;
  period: string;
  dimensionKey: string;
  dimension: string;
  transactions: number;
  payments: number;
  companionPayments: number;
  amount: number;
};

function TransactionsPanel() {
  const { nombre } = useTarifas();
  const [chartOpen, setChartOpen] = useState(false);
  const [graphEntity, setGraphEntity] = useState<GraphEntity>("passenger");
  const [graphStatusFilter, setGraphStatusFilter] = useState<PassengerStatusFilter>("active");
  const [graphStyle, setGraphStyle] = useState<GraphStyle>("bar");
  const [showDriverLines, setShowDriverLines] = useState(true);
  const [rows, setRows] = useState<TxRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, TransactionProfile>>({});
  const [dimensionProfiles, setDimensionProfiles] = useState<TransactionProfile[]>([]);
  const [dimensionProfilesLoading, setDimensionProfilesLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const [breakdown, setBreakdown] = useState<ReportBreakdown>("none");
  const [dimensionScope, setDimensionScope] = useState<"all" | "specific">("all");
  const [dimensionSearch, setDimensionSearch] = useState("");
  const [selectedDimensionId, setSelectedDimensionId] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Category[]>(ALL_CATEGORIES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadTransactions() {
      if (startDate && endDate && startDate > endDate) {
        setRows([]);
        setProfiles({});
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const txs: TxRow[] = [];
        const pageSize = 1000;
        let offset = 0;
        const hasDateFilter = Boolean(startDate || endDate);

        do {
          let query = supabase
            .from("transactions")
            .select("*")
            .order("created_at", { ascending: false })
            .order("id", { ascending: true });
          if (startDate) {
            query = query.gte("created_at", new Date(`${startDate}T00:00:00`).toISOString());
          }
          if (endDate) {
            const exclusiveEnd = new Date(`${endDate}T00:00:00`);
            exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
            query = query.lt("created_at", exclusiveEnd.toISOString());
          }
          if (hasDateFilter) query = query.range(offset, offset + pageSize - 1);
          else query = query.limit(500);

          const { data, error } = await query;
          if (error) throw new Error(error.message);
          const page = (data as TxRow[]) ?? [];
          txs.push(...page);
          if (!hasDateFilter || page.length < pageSize) break;
          offset += pageSize;
        } while (active);

        if (!active) return;
        setRows(txs);
        const ids = Array.from(
          new Set(txs.flatMap((transaction) => [transaction.driver_id, transaction.passenger_id])),
        );
        const profileMap: Record<string, TransactionProfile> = {};
        for (let index = 0; index < ids.length; index += 100) {
          const { data, error } = await supabase
            .from("profiles")
            .select(
              "id, role, status, first_name, paternal_surname, maternal_surname, category, driver_code, transport_line",
            )
            .in("id", ids.slice(index, index + 100));
          if (error) throw new Error(error.message);
          for (const profile of (data ?? []) as TransactionProfile[]) {
            profileMap[profile.id] = profile;
          }
        }
        if (active) setProfiles(profileMap);
      } catch (error) {
        if (active) {
          toast.error(
            error instanceof Error ? error.message : "No se pudieron cargar las transacciones",
          );
          setRows([]);
          setProfiles({});
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadTransactions();
    return () => {
      active = false;
    };
  }, [startDate, endDate]);

  useEffect(() => {
    let active = true;
    async function loadDimensionProfiles() {
      setDimensionProfilesLoading(true);
      try {
        const allProfiles: TransactionProfile[] = [];
        const pageSize = 1000;
        let offset = 0;
        while (active) {
          const { data, error } = await supabase
            .from("profiles")
            .select(
              "id, role, status, first_name, paternal_surname, maternal_surname, category, driver_code, transport_line",
            )
            .in("role", ["driver", "passenger"])
            .order("first_name")
            .order("id", { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (error) throw new Error(error.message);
          const page = (data as TransactionProfile[]) ?? [];
          allProfiles.push(...page);
          if (page.length < pageSize) break;
          offset += pageSize;
        }
        if (active) setDimensionProfiles(allProfiles);
      } catch (error) {
        if (active) {
          toast.error(
            error instanceof Error
              ? `No se pudieron cargar pasajeros y choferes: ${error.message}`
              : "No se pudieron cargar pasajeros y choferes",
          );
        }
      } finally {
        if (active) setDimensionProfilesLoading(false);
      }
    }

    void loadDimensionProfiles();
    return () => {
      active = false;
    };
  }, []);

  const dateError =
    startDate && endDate && startDate > endDate
      ? "La fecha de inicio no puede ser posterior a la fecha fin."
      : "";
  const dimensionType = breakdown === "passenger" ? "passenger" : "driver";
  const filteredRows = rows.filter((transaction) => {
    if ((breakdown === "passenger" || breakdown === "driver") && dimensionScope === "specific") {
      if (!selectedDimensionId) return false;
      const selectedId =
        breakdown === "passenger" ? transaction.passenger_id : transaction.driver_id;
      if (selectedId !== selectedDimensionId) return false;
    }
    if (breakdown === "category") {
      if (
        !getFareLines(transaction).some((line) =>
          selectedCategories.some((category) => category === line.category),
        )
      ) {
        return false;
      }
    }
    return true;
  });

  function getPeriod(value: string) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = date.getMonth();
    if (period === "year") {
      return { key: `${year}`, label: `${year}` };
    }
    if (period === "month") {
      return {
        key: `${year}-${String(month + 1).padStart(2, "0")}`,
        label: date.toLocaleDateString("es-BO", { month: "long", year: "numeric" }),
      };
    }
    if (period === "day") {
      const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return { key: dateKey, label: date.toLocaleDateString("es-BO") };
    }
    const monday = new Date(year, month, date.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const dateKey = (value: Date) =>
      `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    return {
      key: dateKey(monday),
      label: `${monday.toLocaleDateString("es-BO")} - ${sunday.toLocaleDateString("es-BO")}`,
    };
  }

  function getDimension(transaction: TxRow) {
    if (breakdown === "passenger") {
      return {
        key: transaction.passenger_id,
        label: getDimensionName(transaction.passenger_id, transaction.passenger_id),
      };
    }
    if (breakdown === "driver") {
      return {
        key: transaction.driver_id,
        label: getDimensionName(transaction.driver_id, transaction.driver_id),
      };
    }
    return { key: "all", label: "Todos" };
  }

  function getFareLines(transaction: TxRow): FareLine[] {
    const lines: FareLine[] = [];
    if (Array.isArray(transaction.fare_breakdown)) {
      for (const item of transaction.fare_breakdown) {
        if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
        const { category, kind, tickets, amount } = item;
        if (typeof category !== "string" || typeof kind !== "string") continue;
        lines.push({
          category,
          kind,
          tickets: typeof tickets === "number" ? tickets : 1,
          amount: typeof amount === "number" ? amount : 0,
        });
      }
    }
    return lines.length > 0
      ? lines
      : [
          {
            category: transaction.category,
            kind: "titular",
            tickets: Number(transaction.tickets),
            amount: Number(transaction.amount),
          },
        ];
  }

  function buildSummary(transactions: TxRow[], mode: ReportBreakdown): TransactionSummary[] {
    const groups = new Map<string, TransactionSummary>();
    for (const transaction of transactions) {
      const bucket = getPeriod(transaction.created_at);
      const fareLines = getFareLines(transaction);
      if (mode === "category") {
        const categories = new Map<string, FareLine>();
        for (const line of fareLines) {
          const category = line.category;
          if (!selectedCategories.some((selected) => selected === category)) continue;
          const existing = categories.get(category) ?? {
            category,
            kind: "titular",
            tickets: 0,
            amount: 0,
          };
          existing.tickets += line.tickets;
          existing.amount += line.amount;
          if (line.kind === "acompanante") existing.kind = "acompanante";
          categories.set(category, existing);
        }
        for (const [category, line] of categories) {
          const key = `${bucket.key}|${category}`;
          const summary = groups.get(key) ?? {
            periodKey: bucket.key,
            period: bucket.label,
            dimensionKey: category,
            dimension: nombre(category),
            transactions: 0,
            payments: 0,
            companionPayments: 0,
            amount: 0,
          };
          summary.transactions += 1;
          summary.payments += line.tickets;
          summary.companionPayments += fareLines
            .filter((fareLine) => fareLine.category === category && fareLine.kind === "acompanante")
            .reduce((count, fareLine) => count + fareLine.tickets, 0);
          summary.amount += line.amount;
          groups.set(key, summary);
        }
        continue;
      }

      const dimension =
        mode === "none" ? { key: "all", label: "Todos" } : getDimension(transaction);
      const key = `${bucket.key}|${dimension.key}`;
      const summary = groups.get(key) ?? {
        periodKey: bucket.key,
        period: bucket.label,
        dimensionKey: dimension.key,
        dimension: dimension.label,
        transactions: 0,
        payments: 0,
        companionPayments: 0,
        amount: 0,
      };
      summary.transactions += 1;
      for (const line of fareLines) {
        summary.payments += line.tickets;
        if (line.kind === "acompanante") summary.companionPayments += line.tickets;
        summary.amount += line.amount;
      }
      groups.set(key, summary);
    }
    return Array.from(groups.values()).sort(
      (first, second) =>
        first.periodKey.localeCompare(second.periodKey) ||
        first.dimension.localeCompare(second.dimension, "es-BO"),
    );
  }

  const generalSummaryRows = buildSummary(rows, "none");
  const summaryRows = buildSummary(filteredRows, breakdown);

  function exportExcel() {
    const sheet = XLSX.utils.json_to_sheet(
      filteredRows.map((t) => ({
        Fecha: new Date(t.created_at).toLocaleString(),
        "Código validación": t.verification_code,
        Pasajero: getDimensionName(t.passenger_id, t.passenger_id),
        "Tipo de pasajero": profiles[t.passenger_id]?.category
          ? nombre(profiles[t.passenger_id].category)
          : "Sin tipo registrado",
        Chofer: getDimensionName(t.driver_id, t.driver_id),
        "Tarifas acompañantes extra": getCompanionFareTypes(t),
        Pasajes: t.tickets,
        "Monto (Bs)": Number(t.amount),
        Latitud: t.latitude ?? "",
        Longitud: t.longitude ?? "",
        Mapa:
          t.latitude != null && t.longitude != null
            ? `https://www.google.com/maps?q=${t.latitude},${t.longitude}`
            : "",
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Transacciones");
    const summarySheet = XLSX.utils.json_to_sheet(
      summaryRows.map((summary) => ({
        Periodo: summary.period,
        [breakdownLabel]: summary.dimension,
        Transacciones: summary.transactions,
        Pagos: summary.payments,
        "Pagos acompañantes": summary.companionPayments,
        "Monto (Bs)": Number(summary.amount.toFixed(2)),
      })),
    );
    XLSX.utils.book_append_sheet(wb, summarySheet, "Resumen");
    XLSX.writeFile(wb, `transacciones-${startDate || "inicio"}-${endDate || "actualidad"}.xlsx`);
    toast.success("Reporte exportado");
  }

  function exportSummaryExcel(
    rowsToExport: TransactionSummary[],
    title: string,
    includeDimension: boolean,
  ) {
    const sheet = XLSX.utils.json_to_sheet(
      rowsToExport.map((summary) => ({
        Periodo: summary.period,
        ...(includeDimension ? { [breakdownLabel]: summary.dimension } : {}),
        Transacciones: summary.transactions,
        Pagos: summary.payments,
        "Pagos acompañantes": summary.companionPayments,
        "Monto (Bs)": Number(summary.amount.toFixed(2)),
      })),
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Resumen");
    XLSX.writeFile(
      workbook,
      `${title.toLocaleLowerCase("es").replace(/\s+/g, "-")}-${startDate || "inicio"}-${endDate || "actualidad"}.xlsx`,
    );
    toast.success(`${title} exportado a Excel`);
  }

  function exportSummaryPdf(
    rowsToExport: TransactionSummary[],
    title: string,
    includeDimension: boolean,
  ) {
    try {
      const document = new jsPDF({ orientation: "landscape" });
      const pageHeight = document.internal.pageSize.getHeight();
      const pageWidth = document.internal.pageSize.getWidth();
      const columns = [
        { title: "Periodo", getValue: (summary: TransactionSummary) => summary.period },
        ...(includeDimension
          ? [
              {
                title: breakdownLabel,
                getValue: (summary: TransactionSummary) => summary.dimension,
              },
            ]
          : []),
        {
          title: "Transacciones",
          getValue: (summary: TransactionSummary) => String(summary.transactions),
        },
        { title: "Pagos", getValue: (summary: TransactionSummary) => String(summary.payments) },
        {
          title: "Pagos acompañantes",
          getValue: (summary: TransactionSummary) => String(summary.companionPayments),
        },
        {
          title: "Monto (Bs)",
          getValue: (summary: TransactionSummary) => summary.amount.toFixed(2),
        },
      ];
      const positions = columns.map((_, index) => 14 + (pageWidth - 28) * (index / columns.length));
      let y = 18;
      document.setFont("helvetica", "bold");
      document.setFontSize(15);
      document.text(title, 14, y);
      document.setFont("helvetica", "normal");
      document.setFontSize(9);
      y += 8;
      document.text(
        `Periodo: ${startDate || "Sin fecha de inicio"} - ${endDate || "Sin fecha fin"} · Vista ${periodLabel.toLowerCase()}`,
        14,
        y,
      );
      y += 10;

      const writeHeader = () => {
        document.setFont("helvetica", "bold");
        document.setFontSize(8);
        columns.forEach((column, index) => document.text(column.title, positions[index], y));
        y += 6;
        document.setFont("helvetica", "normal");
      };
      writeHeader();
      for (const summary of rowsToExport) {
        if (y > pageHeight - 14) {
          document.addPage();
          y = 18;
          writeHeader();
        }
        document.setFontSize(8);
        columns.forEach((column, index) =>
          document.text(column.getValue(summary).slice(0, 30), positions[index], y),
        );
        y += 6;
      }
      document.save(
        `${title.toLocaleLowerCase("es").replace(/\s+/g, "-")}-${startDate || "inicio"}-${endDate || "actualidad"}.pdf`,
      );
      toast.success(`${title} exportado a PDF`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `No se pudo exportar ${title}`);
    }
  }

  function getDimensionName(id: string, fallback: string) {
    const profile = profiles[id];
    return profile ? profileName(profile, fallback) : fallback;
  }

  function profileName(profile: TransactionProfile, fallback: string) {
    return (
      `${profile.first_name ?? ""} ${profile.paternal_surname ?? ""} ${profile.maternal_surname ?? ""}`
        .trim()
        .replace(/\s+/g, " ") || fallback
    );
  }

  function getCompanionFareTypes(transaction: TxRow) {
    const counts = new Map<string, number>();
    for (const line of getFareLines(transaction)) {
      if (line.kind !== "acompanante") continue;
      const category = line.category;
      counts.set(category, (counts.get(category) ?? 0) + line.tickets);
    }
    return (
      Array.from(counts, ([category, count]) =>
        count > 1 ? `${nombre(category)} (${count})` : nombre(category),
      ).join(", ") || "—"
    );
  }

  const total = filteredRows.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const totalTickets = filteredRows.reduce(
    (sum, transaction) => sum + Number(transaction.tickets),
    0,
  );
  const totalCompanionPayments = filteredRows.reduce(
    (sum, transaction) =>
      sum +
      getFareLines(transaction)
        .filter((line) => line.kind === "acompanante")
        .reduce((count, line) => count + line.tickets, 0),
    0,
  );
  const breakdownLabel =
    breakdown === "passenger"
      ? "Pasajero"
      : breakdown === "category"
        ? "Categoría"
        : breakdown === "driver"
          ? "Chofer"
          : "Agrupación";
  const periodLabel = { day: "Diario", week: "Semanal", month: "Mensual", year: "Anual" }[period];
  const selectedDimension = dimensionProfiles.find(
    (candidate) => candidate.id === selectedDimensionId,
  );
  const dimensionCandidates = dimensionProfiles.filter(
    (candidate) => candidate.role === dimensionType,
  );
  const search = dimensionSearch.trim().toLocaleLowerCase("es");
  const matchingDimensions = dimensionCandidates.filter((candidate) =>
    profileName(candidate, "").toLocaleLowerCase("es").includes(search),
  );
  const dimensionLabel =
    breakdown === "passenger" ? "Pasajero" : breakdown === "driver" ? "Chofer" : "Todos";
  const graphStatusLabels: Record<PassengerStatusFilter, string> = {
    active: "Activos",
    suspended: "Suspendidos",
    all: "Activos y suspendidos",
  };
  const chartColors = [
    "#2563eb",
    "#16a34a",
    "#f97316",
    "#9333ea",
    "#0891b2",
    "#db2777",
    "#ca8a04",
    "#0f766e",
    "#c026d3",
    "#4f46e5",
  ];
  const colorForStatus = (color: string, status: "active" | "suspended") => {
    if (status === "active") return color;
    const channels = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
    return `#${channels
      .map((channel) =>
        Math.round(channel * 0.65)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  };
  const graphData = (() => {
    const groups = new Map<
      string,
      { label: string; activeCount: number; suspendedCount: number }
    >();
    for (const profile of dimensionProfiles) {
      if (profile.role !== graphEntity) continue;
      if (graphStatusFilter !== "all" && profile.status !== graphStatusFilter) continue;
      if (profile.status !== "active" && profile.status !== "suspended") continue;

      let key: string;
      let label: string;
      if (graphEntity === "passenger") {
        key = profile.category ?? "sin_categoria";
        label = profile.category ? nombre(profile.category) : "Sin categoría";
      } else if (showDriverLines) {
        label = profile.transport_line?.trim() || "Sin línea registrada";
        key = label.toLocaleLowerCase("es");
      } else {
        label = "Choferes";
        key = "choferes";
      }

      const current = groups.get(key) ?? { label, activeCount: 0, suspendedCount: 0 };
      if (profile.status === "active") current.activeCount += 1;
      else current.suspendedCount += 1;
      groups.set(key, current);
    }
    return Array.from(groups, ([key, group], index) => ({
      key,
      label: group.label,
      activeCount: group.activeCount,
      suspendedCount: group.suspendedCount,
      count: group.activeCount + group.suspendedCount,
      color: chartColors[index % chartColors.length],
    })).sort(
      (first, second) =>
        second.count - first.count || first.label.localeCompare(second.label, "es"),
    );
  })();
  const graphTotal = graphData.reduce((total, entry) => total + entry.count, 0);
  const graphActiveTotal = graphData.reduce((total, entry) => total + entry.activeCount, 0);
  const graphSuspendedTotal = graphData.reduce((total, entry) => total + entry.suspendedCount, 0);
  const graphPieData =
    graphStatusFilter === "all"
      ? graphData.flatMap((entry) =>
          [
            {
              key: `${entry.key}-active`,
              label: `${entry.label} · Activos`,
              count: entry.activeCount,
              color: colorForStatus(entry.color, "active"),
            },
            {
              key: `${entry.key}-suspended`,
              label: `${entry.label} · Suspendidos`,
              count: entry.suspendedCount,
              color: colorForStatus(entry.color, "suspended"),
            },
          ].filter((segment) => segment.count > 0),
        )
      : graphData.map((entry) => ({ ...entry, count: entry.count }));
  const maxGraphCount = Math.max(
    1,
    ...graphData.flatMap((entry) =>
      graphStatusFilter === "all" ? [entry.activeCount, entry.suspendedCount] : [entry.count],
    ),
  );
  const graphSvgWidth = graphStyle === "pie" ? 760 : Math.max(720, graphData.length * 120 + 40);
  const graphSvgHeight =
    graphStyle === "pie"
      ? Math.max(360, 70 + graphPieData.length * 26)
      : graphStatusFilter === "all"
        ? 390
        : 360;
  const chartTitle =
    graphEntity === "passenger"
      ? "Pasajeros por categoría"
      : showDriverLines
        ? "Choferes por línea"
        : "Choferes registrados";

  function renderSummaryTable(
    title: string,
    summaries: TransactionSummary[],
    includeDimension: boolean,
    fileTag: string,
  ) {
    return (
      <section className="mb-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{title}</h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
              onClick={() => exportSummaryExcel(summaries, fileTag, includeDimension)}
              disabled={loading || summaries.length === 0 || Boolean(dateError)}
            >
              <Download className="mr-1 h-4 w-4" /> Excel del resumen
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
              onClick={() => exportSummaryPdf(summaries, fileTag, includeDimension)}
              disabled={loading || summaries.length === 0 || Boolean(dateError)}
            >
              <FileText className="mr-1 h-4 w-4" /> PDF del resumen
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Periodo</th>
                {includeDimension && <th className="py-2 pr-3">{breakdownLabel}</th>}
                <th className="py-2 pr-3">Transacciones</th>
                <th className="py-2 pr-3">Pagos</th>
                <th className="py-2 pr-3">Pagos acompañantes</th>
                <th className="py-2 pr-3">Monto (Bs)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {summaries.map((summary, index) => (
                <tr key={`${summary.period}-${summary.dimension}-${index}`}>
                  <td className="whitespace-nowrap py-2 pr-3">{summary.period}</td>
                  {includeDimension && <td className="py-2 pr-3">{summary.dimension}</td>}
                  <td className="py-2 pr-3">{summary.transactions}</td>
                  <td className="py-2 pr-3">{summary.payments}</td>
                  <td className="py-2 pr-3">{summary.companionPayments}</td>
                  <td className="py-2 pr-3">Bs {summary.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && summaries.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">
              Sin datos para el periodo seleccionado.
            </p>
          )}
        </div>
      </section>
    );
  }

  async function downloadGraph() {
    const svg = document.getElementById("admin-users-chart");
    if (!(svg instanceof SVGSVGElement)) {
      toast.error("No se encontró la gráfica para descargar");
      return;
    }

    const imageUrl = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svg)], {
        type: "image/svg+xml;charset=utf-8",
      }),
    );
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("No se pudo preparar la imagen de la gráfica"));
        image.src = imageUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = svg.viewBox.baseVal.width;
      canvas.height = svg.viewBox.baseVal.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo crear la imagen para descargar");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!png) throw new Error("No se pudo generar el archivo PNG");

      const downloadUrl = URL.createObjectURL(png);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `grafica-${graphEntity}-${graphStyle}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      toast.success("Gráfica descargada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo descargar la gráfica");
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  function generatePdf() {
    try {
      const document = new jsPDF({ orientation: "landscape" });
      const pageWidth = document.internal.pageSize.getWidth();
      const pageHeight = document.internal.pageSize.getHeight();
      const margins = 14;
      let y = 16;
      const addPage = () => {
        document.addPage();
        y = 16;
      };
      const writeText = (text: string, x = margins, size = 9) => {
        document.setFontSize(size);
        const lines = document.splitTextToSize(text, pageWidth - margins * 2);
        if (y + lines.length * 5 > pageHeight - margins) addPage();
        document.text(lines, x, y);
        y += lines.length * 5;
      };

      document.setFont("helvetica", "bold");
      writeText("Reporte de transacciones", margins, 16);
      document.setFont("helvetica", "normal");
      writeText(
        `Periodo: ${startDate || "Sin fecha de inicio"} - ${endDate || "Sin fecha fin"} · Vista ${periodLabel.toLowerCase()}`,
      );
      writeText(
        `${dimensionLabel}: ${selectedDimension ? profileName(selectedDimension, selectedDimension.id) : "General"} · Desglose: ${breakdownLabel}`,
      );
      writeText(
        `Transacciones: ${filteredRows.length} · Pagos: ${totalTickets} · Pagos acompañantes: ${totalCompanionPayments} · Total: Bs ${total.toFixed(2)}`,
      );
      y += 4;

      document.setFont("helvetica", "bold");
      writeText("Resumen", margins, 12);
      document.setFont("helvetica", "normal");
      for (const summary of summaryRows) {
        writeText(
          `${summary.period} | ${breakdownLabel}: ${summary.dimension} | Transacciones: ${summary.transactions} | Pagos: ${summary.payments} | Pagos acompañantes: ${summary.companionPayments} | Bs ${summary.amount.toFixed(2)}`,
        );
      }

      y += 4;
      document.setFont("helvetica", "bold");
      writeText("Detalle de transacciones", margins, 12);
      const columns = [
        { title: "Fecha", x: 14, max: 15 },
        { title: "Código", x: 42, max: 12 },
        { title: "Pasajero", x: 64, max: 20 },
        { title: "Tipo", x: 98, max: 14 },
        { title: "Chofer", x: 123, max: 20 },
        { title: "Tarifas acompañantes", x: 157, max: 33 },
        { title: "Pasajes", x: 218, max: 8 },
        { title: "Monto Bs", x: 244, max: 17 },
      ];
      const writeTableHeader = () => {
        document.setFont("helvetica", "bold");
        document.setFontSize(8);
        for (const column of columns) {
          document.text(column.title, column.x, y);
        }
        y += 6;
        document.setFont("helvetica", "normal");
      };
      writeTableHeader();
      for (const transaction of filteredRows) {
        if (y > pageHeight - margins) {
          addPage();
          writeTableHeader();
        }
        const values = [
          new Date(transaction.created_at).toLocaleDateString("es-BO"),
          transaction.verification_code,
          getDimensionName(transaction.passenger_id, transaction.passenger_id),
          profiles[transaction.passenger_id]?.category
            ? nombre(profiles[transaction.passenger_id].category)
            : "Sin tipo",
          getDimensionName(transaction.driver_id, transaction.driver_id),
          getCompanionFareTypes(transaction),
          String(transaction.tickets),
          Number(transaction.amount).toFixed(2),
        ];
        document.setFontSize(7);
        for (let index = 0; index < columns.length; index++) {
          document.text(values[index].slice(0, columns[index].max), columns[index].x, y);
        }
        y += 5;
      }
      document.save(
        `reporte-transacciones-${startDate || "inicio"}-${endDate || "actualidad"}.pdf`,
      );
      toast.success("Reporte PDF generado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar el reporte PDF");
    }
  }

  return (
    <Card className="max-w-full overflow-hidden border-brand-blue/15 p-4 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-xl font-bold">Historial de transacciones</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
            onClick={() => setChartOpen(true)}
          >
            <BarChart3 className="mr-1 h-4 w-4" /> Gráficas
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
            onClick={exportExcel}
            disabled={loading || filteredRows.length === 0 || Boolean(dateError)}
          >
            <Download className="w-4 h-4 mr-1" /> Exportar Excel
          </Button>
          <Button
            size="sm"
            className="bg-brand-blue text-white hover:bg-brand-blue-dark"
            onClick={generatePdf}
            disabled={loading || filteredRows.length === 0 || Boolean(dateError)}
          >
            <FileText className="w-4 h-4 mr-1" /> Generar reporte PDF
          </Button>
        </div>
      </div>
      <div className="grid gap-3 mb-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm space-y-1">
          <span className="font-medium">Fecha de inicio</span>
          <Input
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="font-medium">Fecha fin</span>
          <Input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="font-medium">Visualizar por periodo</span>
          <Select value={period} onValueChange={(value) => setPeriod(value as ReportPeriod)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Diario</SelectItem>
              <SelectItem value="week">Semanal</SelectItem>
              <SelectItem value="month">Mensual</SelectItem>
              <SelectItem value="year">Anual</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="text-sm space-y-1">
          <span className="font-medium">Desglosar por</span>
          <Select
            value={breakdown}
            onValueChange={(value) => {
              setBreakdown(value as ReportBreakdown);
              setDimensionScope("all");
              setDimensionSearch("");
              setSelectedDimensionId("");
              if (value === "category") setSelectedCategories(ALL_CATEGORIES);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin desglose</SelectItem>
              <SelectItem value="passenger">Pasajero</SelectItem>
              <SelectItem value="category">Categoría</SelectItem>
              <SelectItem value="driver">Chofer</SelectItem>
            </SelectContent>
          </Select>
        </label>
        {(breakdown === "passenger" || breakdown === "driver") && (
          <>
            <label className="text-sm space-y-1">
              <span className="font-medium">Alcance</span>
              <Select
                value={dimensionScope}
                onValueChange={(value) => {
                  setDimensionScope(value as "all" | "specific");
                  setDimensionSearch("");
                  setSelectedDimensionId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">General</SelectItem>
                  <SelectItem value="specific">Persona específica</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {dimensionScope === "specific" && (
              <div className="text-sm space-y-1">
                <label className="font-medium" htmlFor="report-dimension-search">
                  Buscar {dimensionLabel.toLocaleLowerCase("es")}
                </label>
                <Input
                  id="report-dimension-search"
                  value={dimensionSearch}
                  onChange={(event) => {
                    setDimensionSearch(event.target.value);
                    setSelectedDimensionId("");
                  }}
                  placeholder="Escribe un nombre o apellido"
                  autoComplete="off"
                />
                {dimensionSearch.trim() && !selectedDimensionId && (
                  <div className="max-h-40 overflow-y-auto rounded-md border bg-background">
                    {matchingDimensions.length > 0 ? (
                      matchingDimensions.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left hover:bg-muted"
                          onClick={() => {
                            setSelectedDimensionId(candidate.id);
                            setDimensionSearch(profileName(candidate, candidate.id));
                          }}
                        >
                          {profileName(candidate, candidate.id)}
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-2 text-muted-foreground">
                        No se encontraron coincidencias.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {breakdown === "category" && (
          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium">Categorías a incluir</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {ALL_CATEGORIES.map((category) => (
                <label key={category} className="inline-flex items-center gap-2">
                  <Checkbox
                    checked={selectedCategories.includes(category)}
                    onCheckedChange={(checked) =>
                      setSelectedCategories((current) =>
                        checked
                          ? [...current, category]
                          : current.filter((value) => value !== category),
                      )
                    }
                  />
                  {nombre(category)}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>
      {dateError && <p className="text-sm text-destructive mb-3">{dateError}</p>}
      {!startDate && !endDate && (
        <p className="text-xs text-muted-foreground mb-2">
          Sin rango de fechas se muestran las últimas 500 transacciones. Seleccione fechas para
          consultar el periodo completo.
        </p>
      )}
      <p className="text-sm text-muted-foreground mb-3">
        {loading
          ? "Cargando transacciones..."
          : `${filteredRows.length} transacciones · ${totalTickets} pagos · ${totalCompanionPayments} pagos acompañantes · Total Bs ${total.toFixed(2)}`}
      </p>
      {renderSummaryTable(
        `Resumen general ${periodLabel.toLowerCase()}`,
        generalSummaryRows,
        false,
        "Resumen general",
      )}
      {breakdown !== "none" &&
        renderSummaryTable(
          `Resumen por ${breakdownLabel.toLocaleLowerCase("es")} ${periodLabel.toLowerCase()}`,
          summaryRows,
          true,
          `Resumen ${breakdownLabel}`,
        )}
      <div className="overflow-x-auto">
        <h3 className="font-semibold mb-2">Detalle de transacciones</h3>
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground border-b">
              <th className="py-2 pr-3">Fecha</th>
              <th className="py-2 pr-3">Código</th>
              <th className="py-2 pr-3">Pasajero</th>
              <th className="py-2 pr-3">Tipo de pasajero</th>
              <th className="py-2 pr-3">Chofer</th>
              <th className="py-2 pr-3">Tarifas acompañantes extra</th>
              <th className="py-2 pr-3">Pasajes</th>
              <th className="py-2 pr-3">Monto</th>
              <th className="py-2 pr-3">Ubicación</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredRows.map((t) => (
              <tr key={t.id}>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {new Date(t.created_at).toLocaleString()}
                </td>
                <td className="py-2 pr-3 font-mono">{t.verification_code}</td>
                <td className="py-2 pr-3">{getDimensionName(t.passenger_id, "—")}</td>
                <td className="py-2 pr-3">
                  {profiles[t.passenger_id]?.category
                    ? nombre(profiles[t.passenger_id].category)
                    : "—"}
                </td>
                <td className="py-2 pr-3">{getDimensionName(t.driver_id, "—")}</td>
                <td className="py-2 pr-3">{getCompanionFareTypes(t)}</td>
                <td className="py-2 pr-3">{t.tickets}</td>
                <td className="py-2 pr-3">Bs {Number(t.amount).toFixed(2)}</td>
                <td className="py-2 pr-3">
                  {t.latitude != null && t.longitude != null ? (
                    <a
                      className="inline-flex items-center gap-1 text-brand-blue underline"
                      href={`https://www.google.com/maps?q=${t.latitude},${t.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin className="w-3 h-3" /> Ver mapa
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Sin GPS</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filteredRows.length === 0 && (
          <p className="text-sm text-muted-foreground p-4">Sin transacciones registradas.</p>
        )}
      </div>
      <Dialog open={chartOpen} onOpenChange={setChartOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-3xl overflow-y-auto border-brand-blue/20">
          <DialogHeader>
            <DialogTitle>{chartTitle}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Mostrar</span>
              <Select
                value={graphEntity}
                onValueChange={(value) => setGraphEntity(value as GraphEntity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="passenger">Pasajeros</SelectItem>
                  <SelectItem value="driver">Choferes</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">
                Estado de {graphEntity === "passenger" ? "pasajeros" : "choferes"}
              </span>
              <Select
                value={graphStatusFilter}
                onValueChange={(value) => setGraphStatusFilter(value as PassengerStatusFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="suspended">Suspendidos</SelectItem>
                  <SelectItem value="all">Activos y suspendidos</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Tipo de gráfica</span>
              <Select
                value={graphStyle}
                onValueChange={(value) => setGraphStyle(value as GraphStyle)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Barras</SelectItem>
                  <SelectItem value="pie">Torta</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {graphEntity === "driver" && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={showDriverLines}
                  onCheckedChange={(checked) => setShowDriverLines(checked === true)}
                />
                <span className="font-medium">Mostrar líneas de transporte</span>
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {graphStatusFilter === "all" ? (
                <>
                  Activos: {graphActiveTotal} · Suspendidos: {graphSuspendedTotal} · Total:{" "}
                  {graphTotal} {graphEntity === "passenger" ? "pasajeros" : "choferes"}
                </>
              ) : (
                <>
                  {graphStatusLabels[graphStatusFilter]}: {graphTotal}{" "}
                  {graphEntity === "passenger" ? "pasajeros" : "choferes"}
                </>
              )}
              {graphEntity === "driver" && showDriverLines ? ` · ${graphData.length} líneas` : ""}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-brand-blue/25 text-brand-blue hover:bg-brand-blue-light"
              onClick={downloadGraph}
              disabled={dimensionProfilesLoading || graphData.length === 0}
            >
              <Download className="mr-1 h-4 w-4" /> Descargar PNG
            </Button>
          </div>
          {dimensionProfilesLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Cargando {graphEntity === "passenger" ? "pasajeros" : "choferes"}...
            </p>
          ) : graphData.length > 0 ? (
            <div className="overflow-x-auto">
              <svg
                id="admin-users-chart"
                xmlns="http://www.w3.org/2000/svg"
                width={graphSvgWidth}
                height={graphSvgHeight}
                viewBox={`0 0 ${graphSvgWidth} ${graphSvgHeight}`}
                role="img"
                aria-label={chartTitle}
                className="block bg-white"
              >
                <rect width={graphSvgWidth} height={graphSvgHeight} fill="#ffffff" />
                {graphStyle === "bar" ? (
                  <>
                    <line x1="20" y1="270" x2={graphSvgWidth - 20} y2="270" stroke="#cbd5e1" />
                    {graphData.map((entry, index) => {
                      const slotWidth = graphSvgWidth / graphData.length;
                      const hasStatusSplit = graphStatusFilter === "all";
                      const barWidth = Math.min(72, slotWidth * (hasStatusSplit ? 0.28 : 0.55));
                      const centerX = slotWidth * index + slotWidth / 2;
                      const series =
                        graphStatusFilter === "all"
                          ? [
                              {
                                label: "Activos",
                                count: entry.activeCount,
                                color: colorForStatus(entry.color, "active"),
                              },
                              {
                                label: "Suspendidos",
                                count: entry.suspendedCount,
                                color: colorForStatus(entry.color, "suspended"),
                              },
                            ]
                          : [
                              {
                                label: graphStatusLabels[graphStatusFilter],
                                count: entry.count,
                                color: entry.color,
                              },
                            ];
                      return (
                        <g key={entry.key}>
                          {series.map((item, seriesIndex) => {
                            const x = hasStatusSplit
                              ? centerX - barWidth - 2 + seriesIndex * (barWidth + 4)
                              : centerX - barWidth / 2;
                            const barHeight = (item.count / maxGraphCount) * 210;
                            const y = 260 - barHeight;
                            return (
                              <g key={`${entry.key}-${item.label}`}>
                                <title>
                                  {entry.label} · {item.label}: {item.count}
                                </title>
                                <rect
                                  x={x}
                                  y={y}
                                  width={barWidth}
                                  height={barHeight}
                                  rx="5"
                                  fill={item.color}
                                />
                                {item.count > 0 && (
                                  <text
                                    x={x + barWidth / 2}
                                    y={y - 8}
                                    textAnchor="middle"
                                    fontSize="13"
                                    fill="#111827"
                                  >
                                    {item.count}
                                  </text>
                                )}
                              </g>
                            );
                          })}
                          <text
                            x={centerX}
                            y="294"
                            textAnchor="middle"
                            fontSize="11"
                            fill="#111827"
                          >
                            {entry.label.length > 18 ? `${entry.label.slice(0, 17)}…` : entry.label}
                          </text>
                        </g>
                      );
                    })}
                    {graphStatusFilter === "all" && (
                      <>
                        <rect
                          x="20"
                          y="338"
                          width="12"
                          height="12"
                          rx="2"
                          fill={colorForStatus(graphData[0]?.color ?? chartColors[0], "active")}
                        />
                        <text x="38" y="348" fontSize="12" fill="#111827">
                          Activos
                        </text>
                        <rect
                          x="110"
                          y="338"
                          width="12"
                          height="12"
                          rx="2"
                          fill={colorForStatus(graphData[0]?.color ?? chartColors[0], "suspended")}
                        />
                        <text x="128" y="348" fontSize="12" fill="#111827">
                          Suspendidos
                        </text>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {(() => {
                      let startAngle = -Math.PI / 2;
                      return graphPieData.map((entry) => {
                        const sweep = (entry.count / graphTotal) * Math.PI * 2;
                        const endAngle = startAngle + sweep;
                        const startX = 180 + 132 * Math.cos(startAngle);
                        const startY = 180 + 132 * Math.sin(startAngle);
                        const endX = 180 + 132 * Math.cos(endAngle);
                        const endY = 180 + 132 * Math.sin(endAngle);
                        const largeArc = sweep > Math.PI ? 1 : 0;
                        const path = `M 180 180 L ${startX} ${startY} A 132 132 0 ${largeArc} 1 ${endX} ${endY} Z`;
                        startAngle = endAngle;
                        return (
                          <g key={entry.key}>
                            <title>
                              {entry.label}: {entry.count}
                            </title>
                            {graphPieData.length === 1 ? (
                              <circle cx="180" cy="180" r="132" fill={entry.color} />
                            ) : (
                              <path d={path} fill={entry.color} stroke="#ffffff" strokeWidth="2" />
                            )}
                          </g>
                        );
                      });
                    })()}
                    {graphPieData.map((entry, index) => (
                      <g key={`legend-${entry.key}`}>
                        <rect
                          x="370"
                          y={42 + index * 26}
                          width="14"
                          height="14"
                          rx="2"
                          fill={entry.color}
                        />
                        <text x="394" y={54 + index * 26} fontSize="12" fill="#111827">
                          {entry.label} ({entry.count})
                        </text>
                      </g>
                    ))}
                  </>
                )}
              </svg>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No hay {graphEntity === "passenger" ? "pasajeros" : "choferes"}{" "}
              {graphStatusLabels[graphStatusFilter].toLowerCase()}.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
