import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cx } from '@/components/common/ui';

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  large = true,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** true = volver atrás en el historial; string = ruta concreta */
  back?: boolean | string;
  actions?: ReactNode;
  large?: boolean;
}) {
  const navigate = useNavigate();
  const goBack = () => {
    if (typeof back === 'string') navigate(back);
    else if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };
  return (
    <header className="sticky top-0 z-30 -mx-4 bg-surface/90 px-4 pt-safe backdrop-blur-md">
      <div className={cx('flex items-center gap-2', large ? 'min-h-[56px] pt-2' : 'min-h-[52px]')}>
        {back && (
          <button
            type="button"
            onClick={goBack}
            className="-ml-2 flex h-11 items-center gap-0.5 rounded-full pr-2 text-[16px] font-medium text-brand-600"
            aria-label="Volver"
          >
            <ChevronLeft className="h-6 w-6" />
            <span className="hidden min-[380px]:inline">Atrás</span>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className={cx('truncate font-bold tracking-tight text-ink', large && !back ? 'text-[28px]' : 'text-[19px]')}>{title}</h1>
          {subtitle && <p className="truncate text-[13px] text-ink-mute">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
    </header>
  );
}
