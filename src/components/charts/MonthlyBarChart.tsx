import { formatMonthShort, formatMonthYear } from '@/utils/dates';
import { formatAmount } from '@/utils/money';
import { cx } from '@/components/common/ui';

export interface MonthBar {
  year: number;
  month: number;
  key: string;
  totalCents: number;
}

/**
 * Gráfico de barras propio (SVG/HTML ligero, sin dependencias): evolución
 * mensual del gasto. Pulsar una barra selecciona ese mes.
 */
export function MonthlyBarChart({
  data,
  selectedKey,
  onSelect,
}: {
  data: MonthBar[];
  selectedKey: string | null;
  onSelect: (bar: MonthBar) => void;
}) {
  const max = Math.max(1, ...data.map((d) => d.totalCents));
  const compact = (c: number) => {
    const euros = c / 100;
    if (euros >= 1000) return `${(euros / 1000).toFixed(1).replace('.', ',')} k`;
    return formatAmount(c).replace(/,00$/, '');
  };
  return (
    <div className="flex h-44 items-end gap-2" role="list" aria-label="Gasto de los últimos meses">
      {data.map((d) => {
        const selected = d.key === selectedKey;
        const h = d.totalCents > 0 ? Math.max(6, (d.totalCents / max) * 100) : 3;
        return (
          <button
            key={d.key}
            type="button"
            role="listitem"
            onClick={() => onSelect(d)}
            aria-label={`${formatMonthYear(d.year, d.month)}: ${formatAmount(d.totalCents)} €`}
            aria-pressed={selected}
            className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
          >
            <span className={cx('num text-[11px] font-semibold transition', selected ? 'text-brand-700' : 'text-ink-faint')}>
              {d.totalCents > 0 ? compact(d.totalCents) : ''}
            </span>
            <div className="flex w-full flex-1 items-end justify-center">
              <div
                className={cx(
                  'w-full max-w-[40px] rounded-t-lg rounded-b-md transition-all duration-300',
                  selected ? 'bg-brand-600' : 'bg-brand-100 group-hover:bg-brand-200',
                )}
                style={{ height: `${h}%` }}
              />
            </div>
            <span className={cx('text-[12px] font-semibold', selected ? 'text-ink' : 'text-ink-mute')}>
              {formatMonthShort(d.year, d.month)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
