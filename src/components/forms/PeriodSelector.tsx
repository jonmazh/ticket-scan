import { useState } from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { usePeriod } from '@/app/providers';
import { Sheet } from '@/components/common/Sheet';
import { Button, cx } from '@/components/common/ui';
import { formatMonthName, periodLabel, todayLocal, type Period, type PeriodPreset } from '@/utils/dates';

const PRESETS: { preset: PeriodPreset; label: string }[] = [
  { preset: 'this-month', label: 'Este mes' },
  { preset: 'prev-month', label: 'Mes anterior' },
  { preset: 'last-3-months', label: 'Últimos 3 meses' },
  { preset: 'last-6-months', label: 'Últimos 6 meses' },
  { preset: 'this-year', label: 'Este año' },
  { preset: 'all', label: 'Todo el histórico' },
];

type Mode = 'presets' | 'month' | 'year' | 'range';

/** Selector de periodo (mes, año, rango o atajos). Muestra un botón con el periodo actual. */
export function PeriodSelector({ className }: { className?: string }) {
  const { period, setPeriod } = usePeriod();
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [mode, setMode] = useState<Mode>('presets');
  const [year, setYear] = useState(period.kind === 'month' || period.kind === 'year' ? period.year : now.getFullYear());
  const [month, setMonth] = useState(period.kind === 'month' ? period.month : now.getMonth() + 1);
  const [from, setFrom] = useState(period.kind === 'range' ? period.from : `${now.getFullYear()}-01-01`);
  const [to, setTo] = useState(period.kind === 'range' ? period.to : todayLocal());

  const years = Array.from({ length: 12 }, (_, i) => now.getFullYear() + 1 - i);
  const apply = (p: Period) => {
    setPeriod(p);
    setOpen(false);
  };
  const isPreset = (p: PeriodPreset) => period.kind === 'preset' && period.preset === p;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMode('presets');
          setOpen(true);
        }}
        className={cx(
          'pressable inline-flex h-10 max-w-full items-center gap-2 rounded-full bg-white px-4 text-[15px] font-semibold text-ink shadow-card',
          className,
        )}
        aria-label={`Periodo: ${periodLabel(period)}. Cambiar periodo`}
      >
        <CalendarDays className="h-[18px] w-[18px] shrink-0 text-brand-600" aria-hidden />
        <span className="truncate">{periodLabel(period)}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-mute" aria-hidden />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Periodo">
        <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-surface-sunken p-1 text-[13px] font-semibold">
          {(
            [
              ['presets', 'Rápido'],
              ['month', 'Mes'],
              ['year', 'Año'],
              ['range', 'Fechas'],
            ] as [Mode, string][]
          ).map(([m, l]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cx('h-9 rounded-lg', mode === m ? 'bg-white text-ink shadow-sm' : 'text-ink-mute')}
            >
              {l}
            </button>
          ))}
        </div>

        {mode === 'presets' && (
          <ul className="card divide-y divide-surface-line overflow-hidden">
            {PRESETS.map((p) => (
              <li key={p.preset}>
                <button
                  type="button"
                  onClick={() => apply({ kind: 'preset', preset: p.preset })}
                  className="flex h-[52px] w-full items-center justify-between px-4 text-left text-[16px] active:bg-surface-sunken"
                >
                  <span>{p.label}</span>
                  {isPreset(p.preset) && <Check className="h-5 w-5 text-brand-600" />}
                </button>
              </li>
            ))}
          </ul>
        )}

        {mode === 'month' && (
          <div className="space-y-4">
            <div className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYear(y)}
                  className={cx(
                    'h-9 shrink-0 rounded-full px-4 text-[14px] font-semibold',
                    y === year ? 'bg-ink text-white' : 'bg-white text-ink-soft shadow-card',
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const selected = period.kind === 'month' && period.year === year && period.month === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMonth(m);
                      apply({ kind: 'month', year, month: m });
                    }}
                    className={cx(
                      'h-12 rounded-xl text-[15px] font-medium',
                      selected ? 'bg-brand-600 text-white' : m === month ? 'bg-brand-50 text-brand-700' : 'bg-white text-ink shadow-card',
                    )}
                  >
                    {formatMonthName(m).slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mode === 'year' && (
          <div className="grid grid-cols-3 gap-2">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => apply({ kind: 'year', year: y })}
                className={cx(
                  'h-12 rounded-xl text-[15px] font-semibold',
                  period.kind === 'year' && period.year === y ? 'bg-brand-600 text-white' : 'bg-white text-ink shadow-card',
                )}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        {mode === 'range' && (
          <div className="space-y-4">
            <label className="block">
              <span className="label">Desde</span>
              <input type="date" className="field" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Hasta</span>
              <input type="date" className="field" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
            <Button size="lg" block disabled={!from || !to} onClick={() => apply({ kind: 'range', from, to })}>
              Aplicar rango
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}
