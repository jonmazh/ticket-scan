import { KEYWORDS } from './patterns';
import { pricesInLine } from './itemRules';
import type { ParsedAdjustment } from './types';

/**
 * Detección de totales, subtotal, impuestos (IVA) y descuentos.
 */

export function isTotalLine(line: string): boolean {
  return KEYWORDS.total.test(line) && !KEYWORDS.totalExclusions.test(line);
}

export function isSubtotalLine(line: string): boolean {
  return KEYWORDS.subtotal.test(line);
}

/** Línea de cabecera de la tabla de IVA ("IVA BASE CUOTA", "TIPO BASE IVA TOTAL"). */
export function isTaxHeader(line: string): boolean {
  return /\b(iva|tipo|%)\b/i.test(line) && /\b(base|cuota|imp)/i.test(line) && pricesInLine(line).length === 0;
}

/** Fila de impuestos. Devuelve la cuota detectada (céntimos) y el tipo, o null. */
export function parseTaxRow(line: string, inTaxTable: boolean): { rate: string; cuotaCents: number } | null {
  const hasTaxWord = KEYWORDS.tax.test(line);
  const rateMatch = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(line);
  if (!hasTaxWord && !(inTaxTable && rateMatch)) return null;
  if (/incluid|inclu[ií]do/i.test(line) && pricesInLine(line).length === 0) return null;
  const prices = pricesInLine(line).filter((p) => p >= 0);
  // Quita el porcentaje si se ha leído como importe ("21,00%")
  if (rateMatch && prices.length > 0) {
    const rateCents = Math.round(parseFloat(rateMatch[1].replace(',', '.')) * 100);
    if (/[.,]\d{2}\s*%/.test(line) && prices[0] === rateCents) prices.shift();
  }
  const rate = rateMatch ? `${rateMatch[1].replace('.', ',').replace(/,0+$/, '')}%` : '';
  if (prices.length === 0) return null;
  let cuota: number;
  if (prices.length >= 3) {
    // base, cuota, total (con comprobación) o base, cuota, recargo
    const [base, c, t] = prices;
    cuota = Math.abs(base + c - t) <= 2 ? c : prices[1];
  } else if (prices.length === 2) {
    const [a, b] = prices;
    if (/base/i.test(line) && !/cuota|iva/i.test(line.replace(/base\s+imponible/i, ''))) return null;
    cuota = b < a ? b : a;
  } else {
    if (/base/i.test(line) && !/cuota/i.test(line)) return null;
    cuota = prices[0];
  }
  return { rate, cuotaCents: cuota };
}

export function parseDiscountLine(line: string): ParsedAdjustment | null {
  if (!KEYWORDS.discount.test(line)) return null;
  const prices = pricesInLine(line);
  if (prices.length === 0) return null;
  const amount = prices[prices.length - 1];
  const description = line
    .replace(/-?\d{1,3}(?:\.\d{3})*[.,]\d{2}-?/g, '')
    .replace(/€/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    description: description || 'Descuento',
    type: 'discount',
    amountCents: -Math.abs(amount),
    affectsTotal: true,
    originalLine: line,
  };
}

export function parseRefundLine(line: string): ParsedAdjustment | null {
  const prices = pricesInLine(line);
  if (prices.length === 0) return null;
  const amount = prices[prices.length - 1];
  const description = line
    .replace(/-?\d{1,3}(?:\.\d{3})*[.,]\d{2}-?/g, '')
    .replace(/€/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    description: description || 'Devolución',
    type: 'refund',
    amountCents: -Math.abs(amount),
    affectsTotal: true,
    originalLine: line,
  };
}
