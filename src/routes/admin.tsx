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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  Menu,
  Receipt,
  MapPin,
  Download,
  FileText,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cleanAccount, formatAccount } from "@/lib/bank";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { createSupervisor, updateSupervisor, updateSupervisorPassword } from "@/lib/auth.functions";
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
    </>
  );

  const brandBlock = (
    <div className="p-4 border-b border-white/10">
      <div className="font-bold text-lg">QR Pago Justo</div>
      <div className="text-xs opacity-70">{isAdmin ? "Administrador" : "Supervisor"}</div>
    </div>
  );

  const signOut = (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        navigate({ to: "/" });
      }}
      className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/10 text-sm"
    >
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
            <Button size="icon" variant="ghost" className="text-sidebar-foreground">
              <Menu className="w-5 h-5" />
            </Button>
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
        {tab === "supervisors" && isAdmin && <UserTable role="supervisor" onChange={refresh} />}
        {tab === "transactions" && <TransactionsPanel />}
        {tab === "reports" && <ReportsPanel />}
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
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
          : "hover:bg-white/10"
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
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", role)
      .order("created_at", { ascending: false });
    setRows((data as Profile[]) ?? []);
  }
  useEffect(() => {
    load();
  }, [role]);

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
    ? rows
    : rows.filter((r) => (subtab === "pending" ? r.status === "pending" : r.status !== "pending"));

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
    <Card className="p-4 max-w-full overflow-hidden">
      <h2 className="text-xl font-bold capitalize mb-3">
        {role === "driver" ? "Choferes" : role === "passenger" ? "Pasajeros" : "Supervisores"}
      </h2>
      {isSupervisors && <AddSupervisor onCreated={load} />}
      <Tabs value={subtab} onValueChange={(v) => setSubtab(v as "pending" | "active")}>
        {!isSupervisors && (
          <TabsList>
            <TabsTrigger value="pending">
              Pendientes ({rows.filter((r) => r.status === "pending").length})
            </TabsTrigger>
            <TabsTrigger value="active">Inscritos / Activos</TabsTrigger>
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
                <Button size="sm" variant="outline" onClick={() => setSelected(r)}>
                  {isSupervisors ? "Editar" : "Revisar"}
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[95vw]">
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

                <div className="rounded-md border p-3 space-y-2">
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
                      inputMode="numeric"
                      value={bankAccount}
                      onChange={(e) => setBankAccount(cleanAccount(e.target.value))}
                      placeholder="Ej. 104578"
                    />
                    <Button
                      variant="secondary"
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
                  <div className="rounded-md border p-3 space-y-2">
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
                        variant="secondary"
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
                <div className="rounded-md border p-3 space-y-2">
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
    const status = supervisor.status === "suspended" ? "active" : "suspended";
    setSaving(true);
    const { error } = await supabase
      .from("admins_supervisors")
      .update({ status })
      .eq("id", supervisor.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(status === "suspended" ? "Supervisor suspendido" : "Supervisor habilitado");
    onSaved();
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
      <Button onClick={saveDetails} disabled={saving}>
        Guardar cambios
      </Button>

      <div className="space-y-2 rounded-md border p-3">
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
            variant="secondary"
            onClick={changePassword}
            disabled={saving || password.length < 6}
          >
            Cambiar contraseña
          </Button>
        </div>
      </div>

      <div className="border-t pt-3">
        <Button
          variant={supervisor.status === "suspended" ? "default" : "destructive"}
          onClick={toggleStatus}
          disabled={saving}
        >
          {supervisor.status === "suspended" ? (
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
      <Button size="sm" onClick={() => setOpen(true)}>
        + Agregar Supervisor
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
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
            <Button className="w-full" onClick={create} disabled={busy}>
              Crear supervisor
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: Profile["status"] }) {
  const map = {
    pending: "secondary",
    active: "default",
    rejected: "destructive",
    suspended: "outline",
  } as const;
  return <Badge variant={map[status]}>{STATUS_LABELS[status] ?? status}</Badge>;
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
    <Card className="p-4 max-w-full overflow-hidden">
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
            <Button size="sm" variant="outline" onClick={() => setSelected(r)}>
              Ver
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw]">
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
                <div className="rounded border p-2">
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
                <div className="rounded border p-2">
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
                <Button onClick={() => updateReport("reviewing")} variant="secondary">
                  En revisión
                </Button>
                <Button
                  onClick={() => updateReport("resolved")}
                  className="bg-success text-success-foreground"
                >
                  Resuelto
                </Button>
                <Button onClick={() => updateReport("dismissed")} variant="outline">
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
};

type TransactionProfile = {
  id: string;
  role: Profile["role"];
  first_name: string | null;
  paternal_surname: string | null;
  category: Profile["category"];
  driver_code: string | null;
};

type ReportPeriod = "day" | "week" | "month" | "year";
type ReportBreakdown = "none" | "passenger" | "passengerType" | "driver";

type TransactionSummary = {
  periodKey: string;
  period: string;
  dimensionKey: string;
  dimension: string;
  payments: number;
  tickets: number;
  amount: number;
};

function TransactionsPanel() {
  const { nombre } = useTarifas();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, TransactionProfile>>({});
  const [drivers, setDrivers] = useState<TransactionProfile[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [period, setPeriod] = useState<ReportPeriod>("day");
  const [breakdown, setBreakdown] = useState<ReportBreakdown>("none");
  const [driverId, setDriverId] = useState("all");
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
            .select("id, role, first_name, paternal_surname, category, driver_code")
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
    async function loadDrivers() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, role, first_name, paternal_surname, category, driver_code")
        .eq("role", "driver")
        .order("first_name");
      if (error) {
        if (active) toast.error(`No se pudieron cargar los choferes: ${error.message}`);
        return;
      }
      if (active) setDrivers((data as TransactionProfile[]) ?? []);
    }

    void loadDrivers();
    return () => {
      active = false;
    };
  }, []);

  const dateError =
    startDate && endDate && startDate > endDate
      ? "La fecha de inicio no puede ser posterior a la fecha fin."
      : "";
  const filteredRows = rows.filter(
    (transaction) => driverId === "all" || transaction.driver_id === driverId,
  );

  function getPeriod(value: string) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    if (period === "year") {
      return { key: `${year}`, label: `${year}` };
    }
    if (period === "month") {
      return {
        key: `${year}-${String(month + 1).padStart(2, "0")}`,
        label: date.toLocaleDateString("es-BO", { month: "long", year: "numeric" }),
      };
    }
    if (period === "week") {
      const monday = new Date(year, month, day);
      monday.setDate(day - ((monday.getDay() + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const dateKey = (value: Date) =>
        `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
      return {
        key: dateKey(monday),
        label: `${monday.toLocaleDateString("es-BO")} - ${sunday.toLocaleDateString("es-BO")}`,
      };
    }
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { key: dateKey, label: date.toLocaleDateString("es-BO") };
  }

  function getDimension(transaction: TxRow) {
    if (breakdown === "passenger") {
      return {
        key: transaction.passenger_id,
        label: getDimensionName(transaction.passenger_id, transaction.passenger_id),
      };
    }
    if (breakdown === "passengerType") {
      const category = profiles[transaction.passenger_id]?.category;
      return {
        key: category ?? "unknown",
        label: category ? nombre(category) : "Sin tipo registrado",
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

  const summaryRows = (() => {
    const groups = new Map<string, TransactionSummary>();
    for (const transaction of filteredRows) {
      const bucket = getPeriod(transaction.created_at);
      const dimension = getDimension(transaction);
      const key = `${bucket.key}|${dimension.key}`;
      const summary = groups.get(key) ?? {
        periodKey: bucket.key,
        period: bucket.label,
        dimensionKey: dimension.key,
        dimension: dimension.label,
        payments: 0,
        tickets: 0,
        amount: 0,
      };
      summary.payments += 1;
      summary.tickets += Number(transaction.tickets);
      summary.amount += Number(transaction.amount);
      groups.set(key, summary);
    }
    return Array.from(groups.values()).sort(
      (first, second) =>
        first.periodKey.localeCompare(second.periodKey) ||
        first.dimension.localeCompare(second.dimension, "es-BO"),
    );
  })();

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
        Tarifa: nombre(t.category),
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
        Pagos: summary.payments,
        Pasajes: summary.tickets,
        "Monto (Bs)": Number(summary.amount.toFixed(2)),
      })),
    );
    XLSX.utils.book_append_sheet(wb, summarySheet, "Resumen");
    XLSX.writeFile(wb, `transacciones-${startDate || "inicio"}-${endDate || "actualidad"}.xlsx`);
    toast.success("Reporte exportado");
  }

  function getDimensionName(id: string, fallback: string) {
    const profile = profiles[id];
    return profile ? profileName(profile, fallback) : fallback;
  }

  function profileName(profile: TransactionProfile, fallback: string) {
    return `${profile.first_name ?? ""} ${profile.paternal_surname ?? ""}`.trim() || fallback;
  }

  const total = filteredRows.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const totalTickets = filteredRows.reduce(
    (sum, transaction) => sum + Number(transaction.tickets),
    0,
  );
  const breakdownLabel =
    breakdown === "passenger"
      ? "Pasajero"
      : breakdown === "passengerType"
        ? "Tipo de pasajero"
        : breakdown === "driver"
          ? "Chofer"
          : "Agrupación";
  const periodLabel = { day: "Diario", week: "Semanal", month: "Mensual", year: "Anual" }[period];
  const selectedDriver = drivers.find((driver) => driver.id === driverId);
  const driverLabel = selectedDriver
    ? profileName(selectedDriver, selectedDriver.driver_code ?? selectedDriver.id)
    : "Todos los choferes";

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
      writeText(`Chofer: ${driverLabel} · Desglose: ${breakdownLabel}`);
      writeText(
        `Pagos: ${filteredRows.length} · Pasajes: ${totalTickets} · Total: Bs ${total.toFixed(2)}`,
      );
      y += 4;

      document.setFont("helvetica", "bold");
      writeText("Resumen", margins, 12);
      document.setFont("helvetica", "normal");
      for (const summary of summaryRows) {
        writeText(
          `${summary.period} | ${breakdownLabel}: ${summary.dimension} | Pagos: ${summary.payments} | Pasajes: ${summary.tickets} | Bs ${summary.amount.toFixed(2)}`,
        );
      }

      y += 4;
      document.setFont("helvetica", "bold");
      writeText("Detalle de transacciones", margins, 12);
      const columns = [
        { title: "Fecha", x: 14, max: 22 },
        { title: "Código", x: 52, max: 12 },
        { title: "Pasajero", x: 77, max: 23 },
        { title: "Tipo", x: 116, max: 17 },
        { title: "Chofer", x: 146, max: 23 },
        { title: "Tarifa", x: 185, max: 21 },
        { title: "Pasajes", x: 222, max: 8 },
        { title: "Monto Bs", x: 250, max: 17 },
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
          nombre(transaction.category),
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
    <Card className="p-4 max-w-full overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-xl font-bold">Historial de transacciones</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={exportExcel}
            disabled={loading || filteredRows.length === 0 || Boolean(dateError)}
          >
            <Download className="w-4 h-4 mr-1" /> Exportar Excel
          </Button>
          <Button
            size="sm"
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
            onValueChange={(value) => setBreakdown(value as ReportBreakdown)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin desglose</SelectItem>
              <SelectItem value="passenger">Pasajero</SelectItem>
              <SelectItem value="passengerType">Tipo de pasajero</SelectItem>
              <SelectItem value="driver">Chofer</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="text-sm space-y-1">
          <span className="font-medium">Filtrar por chofer</span>
          <Select value={driverId} onValueChange={setDriverId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los choferes</SelectItem>
              {drivers.map((driver) => (
                <SelectItem key={driver.id} value={driver.id}>
                  {profileName(driver, driver.driver_code ?? driver.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
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
          : `${filteredRows.length} pagos · ${totalTickets} pasajes · Total Bs ${total.toFixed(2)}`}
      </p>
      <div className="mb-5">
        <h3 className="font-semibold mb-2">Resumen {periodLabel.toLowerCase()}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                <th className="py-2 pr-3">Periodo</th>
                <th className="py-2 pr-3">{breakdownLabel}</th>
                <th className="py-2 pr-3">Pagos</th>
                <th className="py-2 pr-3">Pasajes</th>
                <th className="py-2 pr-3">Monto (Bs)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {summaryRows.map((summary, index) => (
                <tr key={`${summary.period}-${summary.dimension}-${index}`}>
                  <td className="py-2 pr-3 whitespace-nowrap">{summary.period}</td>
                  <td className="py-2 pr-3">{summary.dimension}</td>
                  <td className="py-2 pr-3">{summary.payments}</td>
                  <td className="py-2 pr-3">{summary.tickets}</td>
                  <td className="py-2 pr-3">Bs {summary.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && summaryRows.length === 0 && (
            <p className="text-sm text-muted-foreground p-3">
              Sin datos para el periodo seleccionado.
            </p>
          )}
        </div>
      </div>
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
              <th className="py-2 pr-3">Tarifa</th>
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
                <td className="py-2 pr-3">{nombre(t.category)}</td>
                <td className="py-2 pr-3">{t.tickets}</td>
                <td className="py-2 pr-3">Bs {Number(t.amount).toFixed(2)}</td>
                <td className="py-2 pr-3">
                  {t.latitude != null && t.longitude != null ? (
                    <a
                      className="inline-flex items-center gap-1 text-primary underline"
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
    </Card>
  );
}
