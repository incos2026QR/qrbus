import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession, type Profile } from "@/hooks/use-session";
import { getSignedUrl } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LogOut, Users, Bus, Shield, BarChart3, CheckCircle2, XCircle, Ban, ArrowUp } from "lucide-react";
import { grantRole } from "@/lib/auth.functions";

export const Route = createFileRoute("/admin")({ ssr: false, component: AdminPage });

function AdminPage() {
  const { profile, loading, refresh } = useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"drivers" | "passengers" | "supervisors" | "reports">("drivers");

  useEffect(() => {
    if (loading) return;
    if (!profile) navigate({ to: "/" });
    else if (profile.role !== "admin" && profile.role !== "supervisor") navigate({ to: "/" });
  }, [loading, profile, navigate]);

  if (loading || !profile) return <div className="p-8">Cargando...</div>;
  const isAdmin = profile.role === "admin";

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-4 border-b border-white/10">
          <div className="font-bold text-lg">QR Pago Justo</div>
          <div className="text-xs opacity-70">{isAdmin ? "Administrador" : "Supervisor"}</div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          <NavBtn active={tab === "drivers"} onClick={() => setTab("drivers")} icon={<Bus className="w-4 h-4" />}>Choferes</NavBtn>
          <NavBtn active={tab === "passengers"} onClick={() => setTab("passengers")} icon={<Users className="w-4 h-4" />}>Pasajeros</NavBtn>
          {isAdmin && <NavBtn active={tab === "supervisors"} onClick={() => setTab("supervisors")} icon={<Shield className="w-4 h-4" />}>Supervisores</NavBtn>}
          <NavBtn active={tab === "reports"} onClick={() => setTab("reports")} icon={<BarChart3 className="w-4 h-4" />}>Reportes</NavBtn>
        </nav>
        <div className="p-2 border-t border-white/10">
          <button onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/10 text-sm">
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 bg-background overflow-auto">
        {tab === "drivers" && <UserTable role="driver" onChange={refresh} />}
        {tab === "passengers" && <UserTable role="passenger" onChange={refresh} />}
        {tab === "supervisors" && isAdmin && <UserTable role="supervisor" onChange={refresh} allowPromote={false} />}
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
  const [subtab, setSubtab] = useState<"pending" | "active">("pending");
  const [rows, setRows] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);

  async function load() {
    const { data } = await supabase.from("profiles").select("*").eq("role", role).order("created_at", { ascending: false });
    setRows((data as Profile[]) ?? []);
  }
  useEffect(() => { load(); }, [role]);

  const filtered = rows.filter((r) => subtab === "pending" ? r.status === "pending" : r.status !== "pending");

  async function updateStatus(id: string, status: Profile["status"]) {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
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
    <Card className="p-4">
      <h2 className="text-xl font-bold capitalize mb-3">{role === "driver" ? "Choferes" : role === "passenger" ? "Pasajeros" : "Supervisores"}</h2>
      <Tabs value={subtab} onValueChange={(v) => setSubtab(v as "pending" | "active")}>
        <TabsList>
          <TabsTrigger value="pending">Pendientes ({rows.filter(r=>r.status==="pending").length})</TabsTrigger>
          <TabsTrigger value="active">Inscritos / Activos</TabsTrigger>
        </TabsList>
        <TabsContent value={subtab} className="mt-3">
          {filtered.length === 0 && <p className="text-sm text-muted-foreground p-4">Sin registros.</p>}
          <div className="divide-y">
            {filtered.map((r) => (
              <div key={r.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{r.first_name} {r.paternal_surname}</div>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Revisión KYC</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p><strong>Nombre:</strong> {selected.first_name} {selected.paternal_surname} {selected.maternal_surname}</p>
                <p><strong>CI:</strong> {selected.ci_number} · <strong>Nacimiento:</strong> {selected.birthdate}</p>
                <p><strong>Teléfono:</strong> {selected.phone} · <strong>Email:</strong> {selected.email}</p>
                {selected.category && <p><strong>Categoría:</strong> {selected.category}</p>}
                {selected.driver_code && <p><strong>Código chofer:</strong> {selected.driver_code}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ImagePreview label="CI Frontal" path={selected.ci_front_url} bucket="kyc-documents" />
                <ImagePreview label="CI Reverso" path={selected.ci_back_url} bucket="kyc-documents" />
                <ImagePreview label="Selfie" path={selected.selfie_url} bucket="kyc-documents" />
                {selected.license_url && <ImagePreview label="Licencia" path={selected.license_url} bucket="kyc-documents" />}
                {selected.extra_doc_url && <ImagePreview label="Documento adicional" path={selected.extra_doc_url} bucket="kyc-documents" />}
              </div>
              {selected.role === "driver" && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  <ImagePreview label="QR General" path={selected.qr_general_url} bucket="qr-codes" />
                  <ImagePreview label="QR Primaria" path={selected.qr_primaria_url} bucket="qr-codes" />
                  <ImagePreview label="QR Secundaria" path={selected.qr_secundaria_url} bucket="qr-codes" />
                  <ImagePreview label="QR Adulto/Discapacidad" path={selected.qr_adulto_url} bucket="qr-codes" />
                </div>
              )}
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
  return <Badge variant={map[status]}>{status}</Badge>;
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
      {url ? <img src={url} alt={label} className="w-full h-40 object-cover rounded border" />
           : <div className="w-full h-40 bg-muted rounded border flex items-center justify-center text-xs text-muted-foreground">Sin imagen</div>}
    </div>
  );
}

function ReportsPanel() {
  const [rows, setRows] = useState<{ amount: number; category: string; created_at: string }[]>([]);
  useEffect(() => {
    supabase.from("transactions").select("amount, category, created_at").order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setRows((data as { amount: number; category: string; created_at: string }[]) ?? []));
  }, []);
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Reportes / Transacciones</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-4"><div className="text-xs text-muted-foreground">Transacciones</div><div className="text-2xl font-bold">{rows.length}</div></div>
        <div className="rounded-lg border p-4"><div className="text-xs text-muted-foreground">Total Bs</div><div className="text-2xl font-bold">{total.toFixed(2)}</div></div>
      </div>
      <div className="divide-y text-sm">
        {rows.map((r, i) => (
          <div key={i} className="py-2 flex justify-between">
            <span>{r.category}</span><span>Bs {Number(r.amount).toFixed(2)}</span>
            <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
