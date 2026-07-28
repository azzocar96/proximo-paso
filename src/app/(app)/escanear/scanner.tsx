'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import jsQR from 'jsqr';
import { Alert } from '@/components/ui/Alert';

export function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const router = useRouter();
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => () => stopRef.current(), []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setActive(true);
      let raf = 0;
      const tick = () => {
        const canvas = canvasRef.current;
        if (canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) {
            const m = code.data.match(/\/a\/([a-f0-9]{64})/i);
            if (m) { stop(); router.push(`/a/${m[1]}`); return; }
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      const stop = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); setActive(false); };
      stopRef.current = stop;
    } catch {
      setError('No pudimos acceder a la cámara. Da permiso de cámara o escanea el QR con la app de cámara de tu teléfono.');
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert kind="error">{error}</Alert>}
      <div className="rounded-2xl overflow-hidden bg-black aspect-square relative">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        {!active && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button className="btn-primary" onClick={start}>📷 Activar cámara</button>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>
      {active && <p className="text-center text-sm text-gray-500">Buscando código QR…</p>}
    </div>
  );
}
