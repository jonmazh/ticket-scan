import { useEffect, useMemo, useRef, useState } from 'react';
import { Crop, RotateCcw, RotateCw, ScanLine, Undo2, Wand2 } from 'lucide-react';
import { Button, IconButton, Spinner, cx } from '@/components/common/ui';
import {
  FULL_QUAD,
  detectReceiptQuad,
  drawScaled,
  enhanceCanvas,
  rotateCanvas,
  warpQuad,
  type Quad,
} from '@/services/imageService';
import type { EnhancementMode } from '@/types/models';

const BASE_SIDE = 2400;
const PREVIEW_SIDE = 1100;

export interface AdjustResult {
  canvas: HTMLCanvasElement;
  edited: boolean;
}

/**
 * Preparación de la imagen antes del OCR: rotación, recorte con corrección de
 * perspectiva (4 esquinas arrastrables), detección automática aproximada y
 * mejora de contraste. La fotografía original no se modifica.
 */
export function ImageAdjuster({
  image,
  defaultEnhancement,
  onBack,
  onConfirm,
}: {
  image: HTMLImageElement;
  defaultEnhancement: EnhancementMode;
  onBack: () => void;
  onConfirm: (result: AdjustResult) => void;
}) {
  const base = useMemo(() => drawScaled(image, BASE_SIDE), [image]);
  const [rotation, setRotation] = useState(0);
  const rotated = useMemo(() => rotateCanvas(base, rotation), [base, rotation]);
  const preview = useMemo(() => drawScaled(rotated, PREVIEW_SIDE), [rotated]);
  const [quad, setQuad] = useState<Quad>(FULL_QUAD);
  const [enhancement, setEnhancement] = useState<EnhancementMode>(defaultEnhancement);
  const [contrast, setContrast] = useState(1);
  const [step, setStep] = useState<'crop' | 'enhance'>('crop');
  const [result, setResult] = useState<HTMLCanvasElement | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const previewUrl = useMemo(() => preview.toDataURL('image/jpeg', 0.85), [preview]);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ w: 0, h: 0 });

  // Calcula el tamaño exacto de la imagen dentro del área disponible para que
  // las esquinas coincidan con la foto (sin bandas por "object-contain").
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const compute = () => {
      const cs = getComputedStyle(el);
      const aw = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ah = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const ratio = preview.width / preview.height;
      const w = Math.min(aw, ah * ratio);
      setFit({ w: Math.max(0, w), h: Math.max(0, w / ratio) });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [preview, step]);

  // Detección automática al abrir (solo como sugerencia)
  useEffect(() => {
    const q = detectReceiptQuad(preview);
    if (q) {
      setQuad(q);
      setAutoMsg('Bordes detectados automáticamente. Ajusta las esquinas si hace falta.');
    } else {
      setQuad(FULL_QUAD);
      setAutoMsg(null);
    }
  }, [preview]);

  // Genera la vista previa mejorada
  useEffect(() => {
    if (step !== 'enhance') return;
    setBusy(true);
    const t = setTimeout(() => {
      try {
        const warped = warpQuad(rotated, quad);
        const enhanced = enhanceCanvas(warped, enhancement, contrast);
        setResult(enhanced);
        setResultUrl(enhanced.toDataURL('image/jpeg', 0.8));
      } finally {
        setBusy(false);
      }
    }, 30);
    return () => clearTimeout(t);
  }, [step, rotated, quad, enhancement, contrast]);

  const pointFromEvent = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const rotate = (d: number) => {
    setRotation((r) => (r + d + 360) % 360);
    setQuad(FULL_QUAD);
  };

  const autoDetect = () => {
    const q = detectReceiptQuad(preview);
    if (q) {
      setQuad(q);
      setAutoMsg('Bordes detectados. Ajusta las esquinas si hace falta.');
    } else {
      setAutoMsg('No se han podido detectar los bordes. Ajusta las esquinas manualmente.');
    }
  };

  const edited = rotation !== 0 || quad.some((p, i) => p.x !== FULL_QUAD[i].x || p.y !== FULL_QUAD[i].y) || enhancement !== 'none' || contrast !== 1;

  if (step === 'enhance') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-ink">
        <div className="flex items-center justify-between px-3 pt-safe text-white">
          <div className="py-2">
            <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => setStep('crop')} icon={<Undo2 className="h-5 w-5" />}>
              Recorte
            </Button>
          </div>
          <p className="text-[15px] font-semibold">Vista previa</p>
          <div className="w-[96px]" />
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
          {resultUrl && <img src={resultUrl} alt="Vista previa del ticket preparado" className={cx('max-h-full max-w-full rounded-lg object-contain shadow-float', busy && 'opacity-60')} />}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner className="h-8 w-8 text-white" />
            </div>
          )}
        </div>
        <div className="space-y-4 rounded-t-3xl bg-surface px-4 pb-safe pt-4">
          <div>
            <p className="label">Mejora de legibilidad</p>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-sunken p-1">
              {(
                [
                  ['none', 'Original'],
                  ['contrast', 'Contraste'],
                  ['bw', 'Blanco y negro'],
                ] as [EnhancementMode, string][]
              ).map(([m, l]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setEnhancement(m)}
                  className={cx('h-10 rounded-lg text-[14px] font-semibold', enhancement === m ? 'bg-white shadow-sm' : 'text-ink-mute')}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {enhancement !== 'bw' && (
            <label className="block">
              <span className="label">Contraste</span>
              <input
                type="range"
                min={0.6}
                max={1.8}
                step={0.1}
                value={contrast}
                onChange={(e) => setContrast(parseFloat(e.target.value))}
                className="w-full accent-brand-600"
              />
            </label>
          )}
          <div className="pb-4">
            <Button size="lg" block disabled={!result || busy} icon={<ScanLine className="h-5 w-5" />} onClick={() => result && onConfirm({ canvas: result, edited })}>
              Analizar ticket
            </Button>
            <p className="mt-2 text-center text-[12px] text-ink-mute">La fotografía original se guarda sin cambios.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink">
      <div className="flex items-center justify-between px-3 pt-safe text-white">
        <div className="py-2">
          <Button variant="ghost" className="text-white hover:bg-white/10" onClick={onBack} icon={<Undo2 className="h-5 w-5" />}>
            Repetir
          </Button>
        </div>
        <p className="text-[15px] font-semibold">Ajustar imagen</p>
        <div className="w-[96px]" />
      </div>

      <div ref={areaRef} className="flex min-h-0 flex-1 items-center justify-center px-6 py-4">
        <div className="relative" style={{ width: fit.w, height: fit.h }}>
          <img src={previewUrl} alt="Fotografía del ticket" className="h-full w-full select-none rounded-md" draggable={false} />
          <svg
            ref={svgRef}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          >
            <path
              d={`M0,0 H1 V1 H0 Z M${quad.map((p) => `${p.x},${p.y}`).join(' L')} Z`}
              fill="rgba(0,0,0,0.45)"
              fillRule="evenodd"
            />
            <polygon points={quad.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#34E0A8" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
          {quad.map((p, i) => (
            <div
              key={i}
              role="slider"
              tabIndex={0}
              aria-label={['Esquina superior izquierda', 'Esquina superior derecha', 'Esquina inferior derecha', 'Esquina inferior izquierda'][i]}
              aria-valuetext={`${Math.round(p.x * 100)} %, ${Math.round(p.y * 100)} %`}
              aria-valuenow={Math.round(p.x * 100)}
              className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, cursor: 'grab' }}
              onPointerDown={(e) => {
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                dragging.current = i;
              }}
              onPointerMove={(e) => {
                if (dragging.current !== i) return;
                const pt = pointFromEvent(e);
                setQuad((q) => q.map((x, j) => (j === i ? pt : x)) as Quad);
              }}
              onPointerUp={() => (dragging.current = null)}
              onPointerCancel={() => (dragging.current = null)}
              onKeyDown={(e) => {
                const d = 0.01;
                const delta = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
                if (!delta) return;
                e.preventDefault();
                setQuad((q) =>
                  q.map((x, j) =>
                    j === i ? { x: Math.min(1, Math.max(0, x.x + delta[0])), y: Math.min(1, Math.max(0, x.y + delta[1])) } : x,
                  ) as Quad,
                );
              }}
            >
              <span className="h-6 w-6 rounded-full border-[3px] border-brand-500 bg-white shadow-float" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-t-3xl bg-surface px-4 pb-safe pt-4">
        {autoMsg && <p className="mb-3 text-center text-[13px] text-ink-mute">{autoMsg}</p>}
        <div className="mb-4 flex items-center justify-center gap-2">
          <IconButton label="Girar a la izquierda" variant="solid" onClick={() => rotate(-90)}>
            <RotateCcw className="h-5 w-5" />
          </IconButton>
          <IconButton label="Girar a la derecha" variant="solid" onClick={() => rotate(90)}>
            <RotateCw className="h-5 w-5" />
          </IconButton>
          <Button variant="secondary" icon={<Wand2 className="h-4 w-4" />} onClick={autoDetect}>
            Detectar bordes
          </Button>
          <IconButton label="Sin recorte (imagen completa)" variant="solid" onClick={() => setQuad(FULL_QUAD)}>
            <Crop className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="pb-4">
          <Button size="lg" block onClick={() => setStep('enhance')}>
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}
