import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import { CameraOff, Loader2 } from "lucide-react";

type Props = {
  onResult: (text: string) => void;
  onCancel: () => void;
};

/** Live camera QR scanner (jsQR over a canvas frame loop). */
export function QrScanner({ onResult, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const doneRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStarting(false);
        tick();
      } catch {
        setError("No se pudo acceder a la cámara. Usa el código manual.");
        setStarting(false);
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || doneRef.current) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = 320;
        const h = Math.round((video.videoHeight / video.videoWidth) * w) || 240;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            doneRef.current = true;
            onResult(code.data.trim());
            return;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    }

    start();
    return () => {
      doneRef.current = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border bg-black aspect-square max-w-full">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="pointer-events-none absolute inset-8 border-2 border-primary rounded-lg" />
        {starting && (
          <div className="absolute inset-0 grid place-items-center text-primary-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-primary-foreground">
            <div>
              <CameraOff className="w-6 h-6 mx-auto mb-2" />
              {error}
            </div>
          </div>
        )}
      </div>
      <Button variant="outline" className="w-full" onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  );
}
