import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useConfirmState, useToast } from '@/app/providers';
import { Button, cx } from './ui';

/** Diálogo de confirmación global. */
export function ConfirmHost() {
  const { pending, close } = useConfirmState();
  if (!pending) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="absolute inset-0 animate-fade-in bg-ink/40 backdrop-blur-[2px]" onClick={() => close(false)} aria-hidden />
      <div className="relative w-full max-w-sm animate-slide-up rounded-3xl bg-white p-6 shadow-float">
        {pending.destructive && (
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-50 text-danger-500">
            <AlertTriangle className="h-6 w-6" />
          </div>
        )}
        <h2 id="confirm-title" className="text-[18px] font-bold text-ink">
          {pending.title}
        </h2>
        {pending.message && <div className="mt-2 text-[15px] leading-relaxed text-ink-mute">{pending.message}</div>}
        <div className="mt-6 flex flex-col gap-2">
          <Button variant={pending.destructive ? 'danger' : 'primary'} size="lg" block onClick={() => close(true)} autoFocus>
            {pending.confirmLabel ?? 'Confirmar'}
          </Button>
          <Button variant="ghost" size="lg" block onClick={() => close(false)}>
            {pending.cancelLabel ?? 'Cancelar'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Avisos temporales. */
export function ToastHost() {
  const { toasts, dismiss } = useToast();
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-4 pt-safe" aria-live="polite">
      <div className="h-2" />
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'pointer-events-auto flex w-full max-w-md animate-slide-up items-start gap-3 rounded-2xl px-4 py-3 text-[15px] shadow-float',
            t.kind === 'error' ? 'bg-danger-600 text-white' : 'bg-ink text-white',
          )}
          role={t.kind === 'error' ? 'alert' : 'status'}
        >
          {t.kind === 'success' && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />}
          {t.kind === 'error' && <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />}
          {t.kind === 'info' && <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-200" />}
          <span className="flex-1 leading-snug">{t.message}</span>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso" className="-mr-1 opacity-70">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
