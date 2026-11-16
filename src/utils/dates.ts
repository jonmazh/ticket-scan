import { format, parse, isValid, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DateFormatPreference } from '@/types/models';

/**
 * Las fechas de compra se guardan como "YYYY-MM-DD" (fecha local, sin hora ni
 * zona horaria). Así una compra del 30/11 a las 23:30 nunca "salta" de mes.
 */

export type LocalDate = string; // YYYY-MM-DD

export function toLocalDate(d: Date): LocalDate {
  return format(d, 'yyyy-MM-dd');
}

export function todayLocal(): LocalDate {
  return toLocalDate(new Date());
}

/** Convierte "YYYY-MM-DD" en Date local (a mediodía para evitar saltos por horario de verano). */
export function fromLocalDate(s: LocalDate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function isValidLocalDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function monthKey(s: LocalDate): string {
  return s.slice(0, 7);
}

export function formatDate(s: LocalDate, pref: DateFormatPreference = 'dd/MM/yyyy'): string {
  if (!isValidLocalDate(s)) return '—';
  return format(fromLocalDate(s), pref, { locale: es });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatMonthYear(year: number, month: number): string {
  return capitalize(format(new Date(year, month - 1, 1), 'LLLL yyyy', { locale: es }));
}

export function formatMonthName(month: number): string {
  return capitalize(format(new Date(2000, month - 1, 1), 'LLLL', { locale: es }));
}

export function formatMonthShort(year: number, month: number): string {
  return capitalize(format(new Date(year, month - 1, 1), 'LLL', { locale: es }).replace('.', ''));
}

/** "dd/MM/yyyy" -> "YYYY-MM-DD" o null. */
export function parseDisplayDate(s: string): LocalDate | null {
  const d = parse(s.trim(), 'dd/MM/yyyy', new Date());
  return isValid(d) ? toLocalDate(d) : null;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, "dd/MM/yyyy 'a las' HH:mm", { locale: es });
}

// ---------------------------------------------------------------------------
// Periodos de filtrado
// ---------------------------------------------------------------------------

export type PeriodPreset =
  | 'this-month'
  | 'prev-month'
  | 'last-3-months'
  | 'last-6-months'
  | 'this-year'
  | 'all';

export type Period =
  | { kind: 'preset'; preset: PeriodPreset }
  | { kind: 'month'; year: number; month: number }
  | { kind: 'year'; year: number }
  | { kind: 'range'; from: LocalDate; to: LocalDate };

/** Rango inclusivo de fechas locales; null significa sin límite. */
export interface DateRange {
  from: LocalDate | null;
  to: LocalDate | null;
}

export function resolvePeriod(period: Period, today: Date = new Date()): DateRange {
  switch (period.kind) {
    case 'preset': {
      const p = period.preset;
      if (p === 'all') return { from: null, to: null };
      if (p === 'this-month')
        return { from: toLocalDate(startOfMonth(today)), to: toLocalDate(endOfMonth(today)) };
      if (p === 'prev-month') {
        const prev = addMonths(today, -1);
        return { from: toLocalDate(startOfMonth(prev)), to: toLocalDate(endOfMonth(prev)) };
      }
      if (p === 'last-3-months' || p === 'last-6-months') {
        const n = p === 'last-3-months' ? 3 : 6;
        return {
          from: toLocalDate(startOfMonth(addMonths(today, -(n - 1)))),
          to: toLocalDate(endOfMonth(today)),
        };
      }
      return { from: `${today.getFullYear()}-01-01`, to: `${today.getFullYear()}-12-31` };
    }
    case 'month': {
      const d = new Date(period.year, period.month - 1, 1);
      return { from: toLocalDate(startOfMonth(d)), to: toLocalDate(endOfMonth(d)) };
    }
    case 'year':
      return { from: `${period.year}-01-01`, to: `${period.year}-12-31` };
    case 'range': {
      const [a, b] = period.from <= period.to ? [period.from, period.to] : [period.to, period.from];
      return { from: a, to: b };
    }
  }
}

export function isInRange(date: LocalDate, range: DateRange): boolean {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

/** Si el periodo corresponde a un único mes, devuelve año y mes. */
export function singleMonthOf(period: Period, today: Date = new Date()): { year: number; month: number } | null {
  if (period.kind === 'month') return { year: period.year, month: period.month };
  if (period.kind === 'preset' && (period.preset === 'this-month' || period.preset === 'prev-month')) {
    const d = period.preset === 'this-month' ? today : addMonths(today, -1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  return null;
}

export function periodLabel(period: Period, today: Date = new Date()): string {
  switch (period.kind) {
    case 'preset': {
      if (period.preset === 'this-month' || period.preset === 'prev-month') {
        const m = singleMonthOf(period, today)!;
        return formatMonthYear(m.year, m.month);
      }
      const labels: Record<PeriodPreset, string> = {
        'this-month': 'Este mes',
        'prev-month': 'Mes anterior',
        'last-3-months': 'Últimos 3 meses',
        'last-6-months': 'Últimos 6 meses',
        'this-year': `Este año (${today.getFullYear()})`,
        all: 'Todo el histórico',
      };
      return labels[period.preset];
    }
    case 'month':
      return formatMonthYear(period.year, period.month);
    case 'year':
      return `Año ${period.year}`;
    case 'range':
      return `${formatDate(period.from)} – ${formatDate(period.to)}`;
  }
}

/** Lista de los últimos n meses terminando en (endYear, endMonth). */
export function lastMonths(
  endYear: number,
  endMonth: number,
  n: number,
): { year: number; month: number; key: string }[] {
  const out: { year: number; month: number; key: string }[] = [];
  const end = new Date(endYear, endMonth - 1, 1);
  for (let i = n - 1; i >= 0; i--) {
    const d = addMonths(end, -i);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    out.push({ year, month, key: `${year}-${String(month).padStart(2, '0')}` });
  }
  return out;
}

/** Último mes incluido en el periodo (para anclar el gráfico de seis meses). */
export function anchorMonth(range: DateRange, today: Date = new Date()): { year: number; month: number } {
  const ref = range.to && range.to < toLocalDate(today) ? fromLocalDate(range.to) : today;
  return { year: ref.getFullYear(), month: ref.getMonth() + 1 };
}

export function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Validación de hora HH:mm */
export function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}
