import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession, type Profile } from "@/hooks/use-session";
import { getSignedUrl } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { LogOut, Users, Bus, Shield, BarChart3, CheckCircle2, XCircle, Ban, ArrowUp, Menu, Receipt, MapPin, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cleanAccount, formatAccount } from "@/lib/bank";
import * as XLSX from "xlsx";
import { grantRole, createSupervisor } from "@/lib/auth.functions";
import { STATUS_LABELS, ALL_CATEGORIES, type Category } from "@/lib/categories";
import { useTarifas } from "@/lib/tarifas";
import { useBancos } from "@/lib/catalogs";


export const Route = createFileRoute("/admin")({ ssr: false, component: AdminPage });

type Tab = "drivers" | "passengers" | "supervisors" | "transactions" | "reports";

function AdminPage() {
  const { profile, loading, refresh } = useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("drivers");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!profile) navigate({ to: "/" });
    else if (profile.role !== "admin" && profile.role !== "supervisor") navigate({ to: "/" });
  }, [loading, profile, navigate]);

  if (loading || !profile) return <div className="p-8">Cargando...</div>;
  const isAdmin = profile.role === "admin";

  const nav = (
    <>
      <NavBtn active={tab === "drivers"} onClick={() => { setTab("drivers"); setDrawerOpen(false); }} icon={<Bus className="w-4 h-4" />}>Choferes</NavBtn>
      <NavBtn active={tab === "passengers"} onClick={() => { setTab("passengers"); setDrawerOpen(false); }} icon={<Users className="w-4 h-4" />}>Pasajeros</NavBtn>
      {isAdmin && <NavBtn active={tab === "supervisors"} onClick={() => { setTab("supervisors"); setDrawerOpen(false); }} icon={<Shield className="w-4 h-4" />}>Supervisores</NavBtn>}
      <NavBtn active={tab === "transactions"} onClick={() => { setTab("transactions"); setDrawerOpen(false); }} icon={<Receipt className="w-4 h-4" />}>Transacciones</NavBtn>
      <NavBtn active={tab === "reports"} onClick={() => { setTab("reports"); setDrawerOpen(false); }} icon={<BarChart3 className="w-4 h-4" />}>Reportes</NavBtn>
    </>
  );

  const brandBlock = (
    <div className="p-4 border-b border-white/10">
      <div className="font-bold text-lg">QR Pago Justo</div>
      <div className="text-xs opacity-70">{isAdmin ? "Administrador" : "Supervisor"}</div>
    </div>
  );

  const signOut = (
    <button onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}
      className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/10 text-sm">
      <LogOut className="w-4 h-4" /> Cerrar sesión
    </button>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 bg-sidebar text-sidebar-foreground flex-col">
        {brandBlock}
        <nav className="flex-1 p-2 space-y-1">{nav}</nav>
        <div className="p-2 border-t border-white/10">{signOut}</div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between p-3 bg-sidebar text-sidebar-foreground">
        <div className="font-bold">QR Pago Justo</div>
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button size="icon" variant="ghost" className="text-sidebar-foreground"><Menu className="w-5 h-5" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 bg-sidebar text-sidebar-foreground w-64">
            {brandBlock}
            <nav className="flex-1 p-2 space-y-1">{nav}</nav>
            <div className="p-2 border-t border-white/10">{signOut}</div>
          </SheetContent>
        </Sheet>
      </div>

      <main className="flex-1 p-4 sm:p-6 bg-background overflow-auto max-w-full">
        {tab === "drivers" && <UserTable role="driver" onChange={refresh} />}
        {tab === "passengers" && <UserTable role="passenger" onChange={refresh} />}
        {tab === "supervisors" && isAdmin && <UserTable role="supervisor" onChange={refresh} allowPromote={false} />}
        {tab === "transactions" && <TransactionsPanel />}
        {tab === "reports" && <ReportsPanel />}
      </main>
    </div>
  );
}

function NavBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition ${
      active ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold" : "hover:bg-white/10"
    }`}>{icon}{children}</button>
  );
}

function UserTable({ role, onChange, allowPromote = true }: { role: "driver" | "passenger" | "supervisor"; onChange: () => void; allowPromote?: boolean }) {
  const isSupervisors = role === "supervisor";
  const [subtab, setSubtab] = useState<"pending" | "active">(isSupervisors ? "active" : "pending");
  const [rows, setRows] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [overrideCategory, setOverrideCategory] = useState<Category | "">("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankName, setBankName] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const { precio, nombre } = useTarifas();
  const { bancos } = useBancos();

  async function load() {
    const { data } = await supabase.from("profiles").select("*").eq("role", role).order("created_at", { ascending: false });
    setRows((data as Profile[]) ?? []);
  }
  useEffect(() => { load(); }, [role]);

  useEffect(() => {
    setOverrideCategory((selected?.category as Category | null) ?? "");
    setBankAccount(cleanAccount(selected?.bank_account ?? ""));
    setBankName(selected?.bank_name ?? "");
    setRejectionReason(selected?.rejection_reason ?? "");
  }, [selected]);

  async function saveBankAccount() {
    if (!selected) return;
    const { error } = await supabase
      .from("profiles")
      .update({ bank_account: cleanAccount(bankAccount), bank_name: bankName || null })
      .eq("id", selected.id);
    if (error) return toast.error(error.message);
    toast.success("Datos bancarios actualizados");
    load();
  }

  const filtered = isSupervisors
    ? rows.filter((r) => String(r.status).toLowerCase() === "active")
    : rows.filter((r) => (subtab === "pending" ? r.status === "pending" : r.status !== "pending"));

  async function saveCategory() {
    if (!selected || !overrideCategory) return;
    const { error } = await supabase.from("profiles").update({ category: overrideCategory }).eq("id", selected.id);
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
    load(); onChange();
  }

  async function promoteToSupervisor(id: string) {
    await grantRole({ data: { userId: id, role: "supervisor" } });
    toast.success("Promovido a supervisor");
    load();
  }

  return (
    <Card className="p-4 max-w-full overflow-hidden">
      <h2 className="text-xl font-bold capitalize mb-3">{role === "driver" ? "Choferes" : role === "passenger" ? "Pasajeros" : "Supervisores"}</h2>
      <Tabs value={subtab} onValueChange={(v) => setSubtab(v as "pending" | "active")}>
        <TabsList>
          <TabsTrigger value="pending">Pendientes ({rows.filter(r=>r.status==="pending").length})</TabsTrigger>
          <TabsTrigger value="active">Inscritos / Activos</TabsTrigger>
        </TabsList>
        <TabsContent value={subtab} className="mt-3">
          {filtered.length === 0 && <p className="text-sm text-muted-foreground p-4">Sin registros.</p>}
          <div className="divide-y overflow-x-auto">
            {filtered.map((r) => (
              <div key={r.id} className="py-3 flex items-center gap-3 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.first_name} {r.paternal_surname}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    CI: {r.ci_number} · {r.phone} {r.driver_code && `· Código: ${r.driver_code}`}
                  </div>
                </div>
                <StatusBadge status={r.status} />
                <Button size="sm" variant="outline" onClick={() => setSelected(r)}>Revisar</Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[95vw]">
          <DialogHeader><DialogTitle>Revisión de verificación de identidad</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p><strong>Nombre:</strong> {selected.first_name} {selected.paternal_surname} {selected.maternal_surname}</p>
                <p><strong>CI:</strong> {selected.ci_number} · <strong>Nacimiento:</strong> {selected.birthdate}</p>
                <p><strong>Teléfono:</strong> {selected.phone} · <strong>Email:</strong> {selected.email}</p>
                {selected.driver_code && <p><strong>Código chofer:</strong> {selected.driver_code}</p>}
                {selected.transport_line && <p><strong>Línea:</strong> {selected.transport_line}</p>}
                {selected.bank_name && <p><strong>Banco:</strong> {selected.bank_name}</p>}
                {selected.role === "driver" && (
                  <p><strong>Reenvíos de documentos:</strong> {selected.resubmission_count ?? 0} / 3</p>
                )}
                <p><strong>Saldo:</strong> Bs {Number(selected.balance ?? 0).toFixed(2)}</p>
              </div>

              <div className="rounded-md border p-3 space-y-2">
                <p className="text-sm font-semibold">Banco y número de cuenta</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select value={bankName} onValueChange={setBankName}>
                    <SelectTrigger><SelectValue placeholder="Selecciona el banco" /></SelectTrigger>
                    <SelectContent>
                      {bancos.map((b) => <SelectItem key={b.id} value={b.nombre}>{b.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input inputMode="numeric" value={bankAccount} onChange={(e) => setBankAccount(cleanAccount(e.target.value))} placeholder="Ej. 104578" />
                  <Button variant="secondary" onClick={saveBankAccount} disabled={!bankAccount.trim() || !bankName}>Guardar</Button>
                </div>
                <p className="text-xs text-muted-foreground">{formatAccount(bankName, bankAccount)}</p>
              </div>

              {selected.role === "passenger" && (
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-sm font-semibold">Modificar categoría de tarifa</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select value={overrideCategory} onValueChange={(v) => setOverrideCategory(v as Category)}>
                      <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                      <SelectContent>
                        {ALL_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{nombre(c)} — Bs {precio(c).toFixed(2)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="secondary" onClick={saveCategory} disabled={!overrideCategory || overrideCategory === selected.category}>
                      Guardar categoría
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Actual: {selected.category ? nombre(selected.category as Category) : "—"}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ImagePreview label="CI Frontal" path={selected.ci_front_url} bucket="kyc-documents" />
                <ImagePreview label="CI Reverso" path={selected.ci_back_url} bucket="kyc-documents" />
                <ImagePreview label="Selfie" path={selected.selfie_url} bucket="kyc-documents" />
                {selected.license_url && <ImagePreview label="Licencia" path={selected.license_url} bucket="kyc-documents" />}
                {selected.union_doc_url && <ImagePreview label="Credencial de Línea / Sindicato" path={selected.union_doc_url} bucket="kyc-documents" />}
                {selected.extra_doc_url && <ImagePreview label="Documento adicional" path={selected.extra_doc_url} bucket="kyc-documents" />}
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-sm font-semibold">Motivo de rechazo</p>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Ej. La foto del CI está borrosa, vuelve a subirla."
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">Obligatorio al rechazar. El usuario lo verá al iniciar sesión.</p>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={() => updateStatus(selected.id, "active")} className="bg-success text-success-foreground">
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Aprobar
                </Button>
                <Button variant="outline" onClick={() => updateStatus(selected.id, "rejected")}>
                  <XCircle className="w-4 h-4 mr-1" /> Rechazar
                </Button>
                <Button variant="destructive" onClick={() => updateStatus(selected.id, "suspended")}>
                  <Ban className="w-4 h-4 mr-1" /> Suspender
                </Button>
                {allowPromote && (
                  <Button variant="secondary" onClick={() => promoteToSupervisor(selected.id)}>
                    <ArrowUp className="w-4 h-4 mr-1" /> Promover a Supervisor
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StatusBadge({ status }: { status: Profile["status"] }) {
  const map = { pending: "secondary", active: "default", rejected: "destructive", suspended: "outline" } as const;
  return <Badge variant={map[status]}>{STATUS_LABELS[status] ?? status}</Badge>;
}

function ImagePreview({ label, path, bucket }: { label: string; path: string | null; bucket: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    getSignedUrl(supabase, bucket, path).then(setUrl).catch(() => {});
  }, [path, bucket]);
  return (
    <div>
      <p className="text-xs font-medium mb-1">{label}</p>
      {url ? <img src={url} alt={label} className="w-full h-40 object-cover rounded border" /> :
       <div className="w-full h-40 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground">Sin imagen</div>}
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

function ReportsPanel() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [notes, setNotes] = useState("");
  const [reporterProfile, setReporterProfile] = useState<Profile | null>(null);
  const [reportedProfile, setReportedProfile] = useState<Profile | null>(null);

  async function load() {
    const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(100);
    setRows((data as ReportRow[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    setNotes(selected?.admin_notes ?? "");
    setReporterProfile(null); setReportedProfile(null);
    if (!selected) return;
    supabase.from("profiles").select("*").eq("id", selected.reporter_id).maybeSingle()
      .then(({ data }) => setReporterProfile(data as Profile | null));
    if (selected.driver_code) {
      supabase.from("profiles").select("*").eq("driver_code", selected.driver_code).maybeSingle()
        .then(({ data }) => setReportedProfile(data as Profile | null));
    }
  }, [selected]);

  async function updateReport(status: string) {
    if (!selected) return;
    const { error } = await supabase.from("reports").update({ status, admin_notes: notes }).eq("id", selected.id);
    if (error) return toast.error(error.message);
    toast.success("Reporte actualizado");
    setSelected(null); load();
  }

  async function suspendUser(id: string) {
    const { error } = await supabase.from("profiles").update({ status: "suspended" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Usuario suspendido");
  }

  return (
    <Card className="p-4 max-w-full overflow-hidden">
      <h2 className="text-xl font-bold mb-3">Reportes de usuarios</h2>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No hay reportes.</p>}
      <div className="divide-y overflow-x-auto">
        {rows.map((r) => (
          <div key={r.id} className="py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{REPORT_CATEGORY_LABELS[r.category] ?? r.category}</div>
              <div className="text-xs text-muted-foreground truncate">
                {new Date(r.created_at).toLocaleString()} {r.driver_code && `· Chofer: ${r.driver_code}`}
              </div>
              <p className="text-sm truncate">{r.description}</p>
            </div>
            <Badge variant={r.status === "open" ? "destructive" : r.status === "resolved" ? "default" : "secondary"}>{r.status}</Badge>
            <Button size="sm" variant="outline" onClick={() => setSelected(r)}>Ver</Button>
          </div>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw]">
          <DialogHeader><DialogTitle>Detalle del reporte</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div>
                <p><strong>Categoría:</strong> {REPORT_CATEGORY_LABELS[selected.category] ?? selected.category}</p>
                <p><strong>Fecha:</strong> {new Date(selected.created_at).toLocaleString()}</p>
                <p><strong>Estado:</strong> {selected.status}</p>
                {selected.driver_code && <p><strong>Código chofer:</strong> {selected.driver_code}</p>}
                {selected.validation_code && <p><strong>Código de validación:</strong> {selected.validation_code}</p>}
              </div>
              <div>
                <p className="font-semibold">Descripción</p>
                <p className="whitespace-pre-wrap">{selected.description}</p>
              </div>

              {reporterProfile && (
                <div className="rounded border p-2">
                  <p className="text-xs uppercase text-muted-foreground">Reportado por</p>
                  <p><strong>{reporterProfile.first_name} {reporterProfile.paternal_surname}</strong> ({reporterProfile.role})</p>
                  <p className="text-xs">{reporterProfile.email} · {reporterProfile.phone}</p>
                  <Button size="sm" variant="destructive" className="mt-2" onClick={() => suspendUser(reporterProfile.id)}>
                    <Ban className="w-3 h-3 mr-1" /> Suspender reportante
                  </Button>
                </div>
              )}
              {reportedProfile && (
                <div className="rounded border p-2">
                  <p className="text-xs uppercase text-muted-foreground">Chofer reportado</p>
                  <p><strong>{reportedProfile.first_name} {reportedProfile.paternal_surname}</strong> — {reportedProfile.driver_code}</p>
                  <p className="text-xs">{reportedProfile.email} · {reportedProfile.phone}</p>
                  <Button size="sm" variant="destructive" className="mt-2" onClick={() => suspendUser(reportedProfile.id)}>
                    <Ban className="w-3 h-3 mr-1" /> Suspender chofer
                  </Button>
                </div>
              )}

              <div>
                <p className="font-semibold">Notas del administrador</p>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => updateReport("reviewing")} variant="secondary">En revisión</Button>
                <Button onClick={() => updateReport("resolved")} className="bg-success text-success-foreground">Resuelto</Button>
                <Button onClick={() => updateReport("dismissed")} variant="outline">Descartar</Button>
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
};

function TransactionsPanel() {
  const { nombre } = useTarifas();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(500);
      const txs = (data as TxRow[]) ?? [];
      setRows(txs);
      const ids = Array.from(new Set(txs.flatMap((t) => [t.driver_id, t.passenger_id])));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, first_name, paternal_surname, driver_code, bank_account").in("id", ids);
        const map: Record<string, string> = {};
        for (const p of (profs ?? []) as Partial<Profile>[]) {
          map[p.id as string] = `${p.first_name ?? ""} ${p.paternal_surname ?? ""}`.trim() || (p.id as string);
        }
        setNames(map);
      }
    })();
  }, []);

  function exportExcel() {
    const sheet = XLSX.utils.json_to_sheet(rows.map((t) => ({
      Fecha: new Date(t.created_at).toLocaleString(),
      "Código validación": t.verification_code,
      Pasajero: names[t.passenger_id] ?? t.passenger_id,
      Chofer: names[t.driver_id] ?? t.driver_id,
      Tarifa: nombre(t.category),
      Pasajes: t.tickets,
      "Monto (Bs)": Number(t.amount),
      Latitud: t.latitude ?? "",
      Longitud: t.longitude ?? "",
      Mapa: t.latitude != null && t.longitude != null ? `https://www.google.com/maps?q=${t.latitude},${t.longitude}` : "",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Transacciones");
    XLSX.writeFile(wb, `transacciones-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Reporte exportado");
  }

  const total = rows.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <Card className="p-4 max-w-full overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-xl font-bold">Historial de transacciones</h2>
        <Button size="sm" variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>
          <Download className="w-4 h-4 mr-1" /> Exportar Excel
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{rows.length} pagos · Total Bs {total.toFixed(2)}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground border-b">
              <th className="py-2 pr-3">Fecha</th>
              <th className="py-2 pr-3">Código</th>
              <th className="py-2 pr-3">Pasajero</th>
              <th className="py-2 pr-3">Chofer</th>
              <th className="py-2 pr-3">Tarifa</th>
              <th className="py-2 pr-3">Pasajes</th>
              <th className="py-2 pr-3">Monto</th>
              <th className="py-2 pr-3">Ubicación</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="py-2 pr-3 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                <td className="py-2 pr-3 font-mono">{t.verification_code}</td>
                <td className="py-2 pr-3">{names[t.passenger_id] ?? "—"}</td>
                <td className="py-2 pr-3">{names[t.driver_id] ?? "—"}</td>
                <td className="py-2 pr-3">{nombre(t.category)}</td>
                <td className="py-2 pr-3">{t.tickets}</td>
                <td className="py-2 pr-3">Bs {Number(t.amount).toFixed(2)}</td>
                <td className="py-2 pr-3">
                  {t.latitude != null && t.longitude != null ? (
                    <a className="inline-flex items-center gap-1 text-primary underline"
                      href={`https://www.google.com/maps?q=${t.latitude},${t.longitude}`} target="_blank" rel="noreferrer">
                      <MapPin className="w-3 h-3" /> Ver mapa
                    </a>
                  ) : <span className="text-muted-foreground">Sin GPS</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-sm text-muted-foreground p-4">Sin transacciones registradas.</p>}
      </div>
    </Card>
  );
}
