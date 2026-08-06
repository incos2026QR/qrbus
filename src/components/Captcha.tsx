import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RefreshCw, ShieldCheck } from "lucide-react";

/**
 * Verificación humana (anti-bot) sin dependencias externas:
 * desafío aritmético que debe resolverse antes de enviar el registro.
 */
export function Captcha({ verified, onVerify }: { verified: boolean; onVerify: (ok: boolean) => void }) {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [value, setValue] = useState("");

  function regenerate() {
    setA(Math.floor(2 + Math.random() * 8));
    setB(Math.floor(2 + Math.random() * 8));
    setValue("");
    onVerify(false);
  }

  useEffect(() => { regenerate(); }, []);

  function check(next: string) {
    setValue(next);
    onVerify(Number(next) === a + b);
  }

  return (
    <div className="rounded-md border p-3 space-y-2 bg-muted/30">
      <Label className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary" /> Verificación humana *
      </Label>
      <div className="flex items-center gap-2">
        <span className="font-mono text-lg tracking-widest select-none px-3 py-1 rounded bg-background border">
          {a} + {b} = ?
        </span>
        <Input
          inputMode="numeric"
          value={value}
          onChange={(e) => check(e.target.value)}
          placeholder="Respuesta"
          className="max-w-28"
        />
        <Button type="button" variant="ghost" size="icon" onClick={regenerate} aria-label="Generar otro desafío">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      <p className={`text-xs ${verified ? "text-success" : "text-muted-foreground"}`}>
        {verified ? "Verificación completada ✓" : "Resuelve la operación para continuar."}
      </p>
    </div>
  );
}
