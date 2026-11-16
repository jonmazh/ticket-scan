import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, PenLine, RefreshCcw, SwitchCamera, X, Zap } from 'lucide-react';
import { Button, IconButton, Spinner } from '@/components/common/ui';

type CamState = 'starting' | 'live' | 'unavailable' | 'denied' | 'error';

/**
 * Pantalla de captura propia con getUserMedia (cámara trasera preferente).
 * Si la cámara no está disponible (sin HTTPS, permiso denegado o navegador
 * incompatible) ofrece la alternativa nativa de iOS mediante <input type="file">.
 */
export function CameraCapture({
  onCapture,
  onCancel,
  onManual,
}: {
  onCapture: (file: Blob) => void;
  onCancel: () => void;
  onManual: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CamState>('starting');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState<number | null>(null);
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [flash, setFlash] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (index: number | null) => {
      stop();
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        setState('unavailable');
        return;
      }
      setState('starting');
      try {
        const video: MediaTrackConstraints = {
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        };
        const list = devices;
        if (index !== null && list[index]?.deviceId) video.deviceId = { exact: list[index].deviceId };
        else video.facingMode = { ideal: 'environment' };
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        streamRef.current = stream;
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          await el.play().catch(() => undefined);
        }
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorchSupported(Boolean(caps.torch));
        const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        setDevices(all);
        setState('live');
      } catch (err) {
        const name = (err as Error).name;
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' ? 'unavailable' : 'error');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stop],
  );

  useEffect(() => {
    start(null);
    return stop;
  }, [start, stop]);

  const switchCamera = () => {
    if (devices.length < 2) return;
    const current = streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId;
    const idx = devices.findIndex((d) => d.deviceId === current);
    const next = ((idx >= 0 ? idx : deviceIndex ?? 0) + 1) % devices.length;
    setDeviceIndex(next);
    start(next);
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorchSupported(false);
    }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    c.toBlob(
      (b) => {
        if (b) {
          stop();
          onCapture(b);
        }
      },
      'image/jpeg',
      0.92,
    );
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) {
      stop();
      onCapture(f);
    }
  };

  const fallback = state === 'unavailable' || state === 'denied' || state === 'error';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={onFile} />

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-safe">
        <div className="py-2">
          <IconButton label="Cancelar" variant="glass" onClick={() => { stop(); onCancel(); }}>
            <X className="h-6 w-6" />
          </IconButton>
        </div>
        <div className="flex gap-2 py-2">
          {state === 'live' && torchSupported && (
            <IconButton label={torch ? 'Apagar linterna' : 'Encender linterna'} variant="glass" onClick={toggleTorch} className={torch ? 'text-warn-100' : ''}>
              <Zap className="h-5 w-5" />
            </IconButton>
          )}
          {state === 'live' && devices.length > 1 && (
            <IconButton label="Cambiar de cámara" variant="glass" onClick={switchCamera}>
              <SwitchCamera className="h-5 w-5" />
            </IconButton>
          )}
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className={fallback ? 'hidden' : 'h-full w-full object-cover'} />
        {state === 'live' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <div className="h-[72%] w-[64%] rounded-3xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
        {state === 'live' && (
          <p className="absolute bottom-4 left-0 right-0 text-center text-[14px] text-white/85">
            Encuadra el ticket completo, bien iluminado y plano
          </p>
        )}
        {state === 'starting' && (
          <div className="flex flex-col items-center gap-3 text-white/80">
            <Spinner className="h-8 w-8 text-white" />
            <p>Abriendo la cámara…</p>
          </div>
        )}
        {fallback && (
          <div className="mx-auto flex max-w-sm flex-col items-center px-8 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10">
              <Camera className="h-8 w-8" />
            </div>
            <h2 className="text-[19px] font-bold">
              {state === 'denied' ? 'Sin permiso para usar la cámara' : 'Cámara no disponible aquí'}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-white/70">
              {state === 'denied'
                ? 'Puedes darlo en Ajustes del iPhone › Safari › Cámara, o usar la cámara del sistema con el botón de abajo.'
                : 'Usa la cámara del sistema o elige una foto de la galería. La cámara integrada necesita HTTPS.'}
            </p>
            <div className="mt-6 flex w-full flex-col gap-2">
              <Button size="lg" block icon={<Camera className="h-5 w-5" />} onClick={() => cameraInput.current?.click()}>
                Hacer foto
              </Button>
              {state !== 'unavailable' && (
                <Button size="lg" variant="ghost" block className="text-white hover:bg-white/10" icon={<RefreshCcw className="h-5 w-5" />} onClick={() => start(null)}>
                  Reintentar cámara integrada
                </Button>
              )}
            </div>
          </div>
        )}
        {flash && <div className="absolute inset-0 bg-white/70" aria-hidden />}
      </div>

      <div className="relative flex items-center justify-between px-8 pb-safe pt-5">
        <button type="button" onClick={() => galleryInput.current?.click()} className="flex w-16 flex-col items-center gap-1 pb-5 text-[12px] text-white/85">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
            <ImagePlus className="h-6 w-6" />
          </span>
          Galería
        </button>
        <button
          type="button"
          onClick={state === 'live' ? capture : () => cameraInput.current?.click()}
          aria-label="Hacer fotografía"
          className="mb-5 flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-white/90 transition active:scale-95"
        >
          <span className="h-[60px] w-[60px] rounded-full bg-white" />
        </button>
        <button type="button" onClick={() => { stop(); onManual(); }} className="flex w-16 flex-col items-center gap-1 pb-5 text-[12px] text-white/85">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
            <PenLine className="h-6 w-6" />
          </span>
          Manual
        </button>
      </div>
    </div>
  );
}
