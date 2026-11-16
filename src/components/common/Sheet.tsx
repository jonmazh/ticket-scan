import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from './ui';

/** Hoja inferior modal (estilo iOS). En pantallas grandes se muestra centrada. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'auto',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'auto' | 'full';
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}>
      <div className="absolute inset-0 animate-fade-in bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        className={cx(
          'relative flex w-full max-w-lg animate-sheet-up flex-col rounded-t-3xl bg-surface shadow-float sm:animate-slide-up sm:rounded-3xl',
          size === 'full' ? 'h-[92dvh] sm:h-[85dvh]' : 'max-h-[88dvh]',
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-surface-line sm:hidden" aria-hidden />
        {title && (
          <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-3">
            <h2 id={titleId} className="text-[18px] font-bold text-ink">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-sunken text-ink-soft"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-1">{children}</div>
        {footer && <div className="border-t border-surface-line px-5 pb-safe pt-3"><div className="pb-3">{footer}</div></div>}
        {!footer && <div className="pb-safe" />}
      </div>
    </div>,
    document.body,
  );
}
