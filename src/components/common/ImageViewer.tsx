import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import { IconButton } from './ui';

/**
 * Visor a pantalla completa con zoom (pellizco, doble toque, rueda o botones)
 * y desplazamiento.
 */
export function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const clamp = (s: number) => Math.min(6, Math.max(1, s));
  const setZoom = (s: number) => {
    const z = clamp(s);
    setScale(z);
    if (z === 1) setOffset({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
      drag.current = null;
    } else {
      const now = Date.now();
      if (now - lastTap.current < 280) setZoom(scale > 1 ? 1 : 2.5);
      lastTap.current = now;
      drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      setZoom((pinch.current.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist);
    } else if (drag.current && scale > 1) {
      setOffset({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y });
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-safe">
        <div className="flex gap-2 py-2">
          <IconButton label="Alejar" variant="glass" onClick={() => setZoom(scale / 1.5)}>
            <Minus className="h-5 w-5" />
          </IconButton>
          <IconButton label="Acercar" variant="glass" onClick={() => setZoom(scale * 1.5)}>
            <Plus className="h-5 w-5" />
          </IconButton>
          <IconButton label="Restablecer zoom" variant="glass" onClick={() => setZoom(1)}>
            <RotateCcw className="h-5 w-5" />
          </IconButton>
        </div>
        <IconButton label="Cerrar" variant="glass" onClick={onClose}>
          <X className="h-5 w-5" />
        </IconButton>
      </div>
      <div
        className="flex flex-1 touch-none items-center justify-center overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => setZoom(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15))}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transition: pinch.current || drag.current ? 'none' : 'transform 120ms ease-out' }}
        />
      </div>
      <p className="pb-safe text-center text-[13px] text-white/60">
        <span className="inline-block py-3">Pellizca o toca dos veces para ampliar</span>
      </p>
    </div>,
    document.body,
  );
}
