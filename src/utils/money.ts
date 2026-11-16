import type { CurrencyCode, QuantityUnit } from '@/types/models';

/**
 * Utilidades monetarias. Todo se opera en céntimos enteros.
 */

const CURRENCY_SYMBOL: Record<CurrencyCode, string> = { EUR: '€', USD: '$', GBP: '£' };

/** Agrupa miles con punto (estilo español, también con 4 cifras: 1.250). */
function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 125050 -> "1.250,50 €" */
export function formatMoney(cents: number, currency: CurrencyCode = 'EUR'): string {
  return `${formatAmount(cents)}\u00a0${CURRENCY_SYMBOL[currency] ?? currency}`;
}

/** 125050 -> "1.250,50" (sin símbolo). */
export function formatAmount(cents: number): string {
  const safe = Math.round(cents);
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const intPart = Math.floor(abs / 100).toString();
  const dec = (abs % 100).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${groupThousands(intPart)},${dec}`;
}

/** Valor para un campo de edición: 120 -> "1,20". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '';
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  return `${negative ? '-' : ''}${Math.floor(abs / 100)},${(abs % 100).toString().padStart(2, '0')}`;
}

const CURRENCY_TOKEN = /^(EUR|€|\$|£)|(EUR|€|\$|£)$/gi;

/**
 * Convierte un texto de importe en céntimos.
 * Reconoce formatos europeos y anglosajones:
 *  "1,20" "1,20 €" "1.234,56" "12.50" "1.234" "0,99" "12,00-" "-3,10" "(2,00)" "EUR 4,5"
 * Reglas:
 *  - Si aparecen punto y coma, el último separador es el decimal.
 *  - Coma sola: decimal si le siguen 1 o 2 cifras.
 *  - Punto solo: decimal si le siguen 1 o 2 cifras; miles si le siguen grupos de 3.
 *  - Una coma seguida de 3 cifras ("1,250") NO es un importe (suele ser un peso).
 * Devuelve null si el texto no es un importe válido.
 */
export function parseAmount(input: string, options: { allowInteger?: boolean } = {}): number | null {
  const allowInteger = options.allowInteger ?? true;
  if (!input) return null;
  let s = input.trim().replace(/\s+/g, '');
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(CURRENCY_TOKEN, '');
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = true;
    s = s.slice(1);
  } else if (s.endsWith('-') || s.endsWith('−')) {
    negative = true;
    s = s.slice(0, -1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  s = s.replace(CURRENCY_TOKEN, '');
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  let intPart: string;
  let decPart = '';
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    const decSep = lastComma > lastDot ? ',' : '.';
    const thouSep = decSep === ',' ? '.' : ',';
    const idx = s.lastIndexOf(decSep);
    intPart = s.slice(0, idx);
    decPart = s.slice(idx + 1);
    if (intPart.includes(decSep)) return null;
    if (!new RegExp(`^\\d{1,3}(\\${thouSep}\\d{3})*$`).test(intPart)) return null;
    intPart = intPart.split(thouSep).join('');
    if (!/^\d{1,2}$/.test(decPart)) return null;
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    if (parts.length !== 2) return null;
    [intPart, decPart] = parts;
    if (!/^\d*$/.test(intPart) || !/^\d{1,2}$/.test(decPart)) return null;
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    if (parts.length === 2 && /^\d{1,2}$/.test(parts[1]) && /^\d*$/.test(parts[0])) {
      [intPart, decPart] = parts;
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      if (!allowInteger) return null;
      intPart = parts.join('');
    } else {
      return null;
    }
  } else {
    if (!allowInteger) return null;
    intPart = s;
  }

  if (intPart === '') intPart = '0';
  if (intPart.length > 9) return null;
  const cents = parseInt(intPart, 10) * 100 + parseInt(decPart.padEnd(2, '0') || '0', 10);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

/**
 * Convierte un texto de cantidad en número: "2" -> 2, "1,250" -> 1.25, "0.5" -> 0.5.
 * En cantidades la coma siempre es decimal (hasta 3 decimales).
 */
export function parseQuantity(input: string): number | null {
  if (!input) return null;
  const s = input.trim().replace(/\s+/g, '');
  if (!/^\d{1,5}([.,]\d{1,3})?$/.test(s)) return null;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 1.25 -> "1,25"; 2 -> "2"; 1.5 -> "1,5" (hasta 3 decimales). */
export function formatQuantity(q: number): string {
  const rounded = Math.round(q * 1000) / 1000;
  return rounded.toString().replace('.', ',');
}

export const UNIT_LABEL: Record<QuantityUnit, string> = {
  ud: 'ud',
  kg: 'kg',
  g: 'g',
  l: 'l',
  ml: 'ml',
};

export function formatQuantityWithUnit(q: number, unit: QuantityUnit): string {
  if (unit === 'ud') return `${formatQuantity(q)} ${q === 1 ? 'ud' : 'uds'}`;
  return `${formatQuantity(q)} ${UNIT_LABEL[unit]}`;
}

/** Importe de línea a partir de cantidad y precio unitario (redondeo al céntimo). */
export function lineTotalFrom(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}

/** Precio unitario a partir de importe y cantidad. */
export function unitPriceFrom(lineTotalCents: number, quantity: number): number {
  if (!quantity) return lineTotalCents;
  return Math.round(lineTotalCents / quantity);
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += Math.round(v);
  return total;
}

/** Porcentaje en formato español: 12.345 -> "12,3 %" */
export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits).replace('.', ',')}\u00a0%`;
}
