import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Send } from "lucide-react";

export const Route = createFileRoute("/reportes")({ ssr: false, component: ReportsPage });

const CATEGORIES = [
  { value: "tarifa_incorrecta", label: "Cobro incorrecto" },
  { value: "mala_conducta", label: "Mala conducta" },
  { value: "bug_app", label: "Error en la app" },
  { value: "otro", label: "Otro" },
];

type MyReport = {
  id: string;
  category: string;
  description: string;
  driver_code: string | null;
  status: string;
  created_at: string;
};

function ReportsPage() {
  const { profile, userId, loading } = useSession();
  const navigate = useNavigate();
  const [category, setCategory] = useState("tarifa_incorrecta");
  const [driverCode, setDriverCode] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<MyReport[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!profile || !userId) navigate({ to: "/" });
  }, [loading, profile, userId, navigate]);

  async function loadMine() {
    if (!userId) return;
    const { data } = await supabase.from("reports").select("id, category, description, driver_code, status, created_at")
      .eq("reporter_id", userId).order("created_at", { ascending: false }).limit(20);
    setMine((data as MyReport[]) ?? []);
  }
  useEffect(() => { loadMine(); }, [userId]);

  const backTo = profile?.role === "driver" ? "/driver" : "/passenger";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return toast.error("Describe el problema");
    if (!userId) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("reports").insert({
        reporter_id: userId,
        category,
        description: description.trim(),
        driver_code: driverCode.trim().toUpperCase() || null,
        transaction_id: transactionId.trim() || null,
      });
      if (error) throw error;
      toast.success("Reporte enviado. Un supervisor lo revisará.");
      setDescription(""); setDriverCode(""); setTransactionId("");
      loadMine();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-xl mx-auto space-y-4">
      <header className="flex items-center gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link to={backTo}><ArrowLeft className="w-4 h-4 mr-1" /> Volver</Link>
        </Button>
        <h1 className="font-bold text-lg">Reportes y quejas</h1>
      </header>

      <Card className="p-4">
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Categoría</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Código del chofer (opcional)</Label>
            <Input value={driverCode} onChange={(e) => setDriverCode(e.target.value.toUpperCase())} placeholder="DRV84" />
          </div>
          <div>
            <Label>ID de transacción (opcional)</Label>
            <Input value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="UUID" />
          </div>
          <div>
            <Label>Descripción *</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe brevemente el problema..." />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar reporte
          </Button>
        </form>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-2">Mis reportes</h2>
        {mine.length === 0 && <p className="text-sm text-muted-foreground">Aún no has enviado reportes.</p>}
        <div className="divide-y">
          {mine.map((r) => (
            <div key={r.id} className="py-2 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">{CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category}</span>
                <span className="text-xs uppercase text-muted-foreground">{r.status}</span>
              </div>
              <p className="text-muted-foreground text-xs">{new Date(r.created_at).toLocaleString()}</p>
              <p className="mt-1">{r.description}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
