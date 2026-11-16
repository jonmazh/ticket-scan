import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type InputHTMLAttributes } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { formatMoney } from '@/utils/money';
import { useSettings } from '@/app/providers';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-200',
  dark: 'bg-ink text-white hover:bg-ink-soft disabled:bg-ink-faint',
  secondary: 'bg-white text-ink border border-surface-line hover:bg-surface-sunken disabled:text-ink-faint',
  ghost: 'bg-transparent text-ink-soft hover:bg-surface-sunken disabled:text-ink-faint',
  danger: 'bg-danger-50 text-danger-600 hover:bg-danger-100 disabled:opacity-50',
};
const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-[14px] rounded-xl gap-1.5',
  md: 'h-11 px-4 text-[15px] rounded-xl gap-2',
  lg: 'h-14 px-5 text-[16px] rounded-2xl gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'pressable inline-flex select-none items-center justify-center font-semibold disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  variant = 'ghost',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: 'ghost' | 'solid' | 'glass' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'pressable inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40',
        variant === 'ghost' && 'text-ink-soft hover:bg-surface-sunken',
        variant === 'solid' && 'bg-white text-ink shadow-card',
        variant === 'glass' && 'bg-black/40 text-white backdrop-blur',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx('card pressable block w-full text-left', className)}>
        {children}
      </button>
    );
  }
  return <div className={cx('card', className)}>{children}</div>;
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'brand' | 'warn' | 'danger'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-surface-sunken text-ink-soft',
    brand: 'bg-brand-50 text-brand-700',
    warn: 'bg-warn-50 text-warn-700',
    danger: 'bg-danger-50 text-danger-600',
  };
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold', tones[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('animate-spin text-brand-600', className ?? 'h-6 w-6')} aria-label="Cargando" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-surface-sunken', className)} aria-hidden />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card flex items-center gap-3 p-3">
          <Skeleton className="h-14 w-11 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex animate-fade-in flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-50 text-brand-600">{icon}</div>
      <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
      {message && <p className="mt-1.5 max-w-xs text-[15px] leading-relaxed text-ink-mute">{message}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cx('flex rounded-xl bg-surface-sunken p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-9 flex-1 rounded-lg px-2 text-[14px] font-semibold transition',
            value === o.value ? 'bg-white text-ink shadow-sm' : 'text-ink-mute',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-faint" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-transparent bg-surface-sunken pl-10 pr-10 text-ink outline-none transition placeholder:text-ink-faint focus:border-brand-500 focus:bg-white"
        {...rest}
      />
      {value && (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </label>
  );
}

/** Importe formateado con la moneda de los ajustes. */
export function Money({ cents, className }: { cents: number; className?: string }) {
  const { settings } = useSettings();
  return <span className={cx('num whitespace-nowrap', className)}>{formatMoney(cents, settings.currency)}</span>;
}

export function Row({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-4 py-2.5 text-[15px]', className)}>
      <span className="text-ink-mute">{label}</span>
      <span className="text-right font-medium text-ink">{children}</span>
    </div>
  );
}
