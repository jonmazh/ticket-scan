/**
 * Expresiones regulares y palabras clave compartidas por las reglas del parser.
 * Evitamos lookbehind para mantener compatibilidad con Safari antiguo.
 */

/** Importe con dos decimales: 1,20  1.234,56  12.50  12,00-  -3,10 */
export const PRICE = String.raw`-?(?:\d{1,3}(?:\.\d{3})+|\d{1,6})[.,]\d{2}-?`;
/** Cantidad: 2  1,250  0.5 */
export const QTY = String.raw`\d{1,4}(?:[.,]\d{1,3})?`;
/** Unidad de medida */
export const UNIT = String.raw`(?:kgs?|kilos?|grs?|g|lts?|l|uds?|un|u)`;
/** Separador de multiplicación */
export const TIMES = String.raw`[x*]`;

export const KEYWORDS = {
  total: /\b(total|importe\s+total|a\s+pagar|total\s+compra|total\s+a\s+pagar|importe\s+a\s+pagar)\b/i,
  totalExclusions:
    /\b(sub\s*-?\s*total|base|cuota|iva|i\.v\.a|art[ií]culos?|arts?\.?|unidades|uds|ahorro|ahorrado|dto|descuentos?|puntos|saldo|items?|productos|l[ií]neas|bruto)\b/i,
  subtotal: /\b(sub\s*-?\s*total|suma|total\s+bruto|importe\s+bruto)\b/i,
  tax: /\b(iva|i\.v\.a\.?|igic|impuestos?|base\s+imp(onible)?|cuota|tipo)\b/i,
  discount:
    /\b(descuentos?|dto\.?|dtos?|desc\.?|promo(ci[oó]n)?|ofertas?|ahorro|cup[oó]n|vales?|rebaja|bonif(icaci[oó]n)?|2[ªa]\s*(ud|unidad)|3x2|2x1|club|socio)\b/i,
  refund: /\b(devoluci[oó]n|devol\.?|abono|anulaci[oó]n|retorno|envases?\s+devueltos?)\b/i,
  payment:
    /\b(efectivo|tarjeta|visa|mastercard|maestro|amex|cambio|entregado|entrega|a\s+devolver|pagado|pago|contactless|dat[aá]fono|autoriz|aut\.|aid|arc|tvr|terminal|comercio\s+n|n\.?\s*op|bizum|cr[eé]dito|d[eé]bito|propina|redondeo)\b/i,
  info: /\b(gracias|visita|vuelva|bienvenid|horario|atendid|cajer[oa]|caja\s*\d|www\.|https?:|@|factura\s+simplificada|ticket\s*n|n[º°]\s*ticket|tel[eé]?f?\.?|tlf|fax|c\.?i\.?f|n\.?i\.?f|iva\s+incluido|impuestos\s+incluidos|precios?\s+con\s+iva|copia|cliente|socio|puntos|cambios?\s+y\s+devoluciones|conserve|garant[ií]a|devoluciones\s+en|plazo|vendedor|operador|tienda\s*n|establecimiento|pedido)\b/i,
} as const;

export const MONTHS_ES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
};

/** Cadenas españolas conocidas (para detectar el establecimiento). */
export const KNOWN_MERCHANTS: { re: RegExp; name: string }[] = [
  { re: /mercadona/i, name: 'Mercadona' },
  { re: /carrefour/i, name: 'Carrefour' },
  { re: /\blidl\b/i, name: 'Lidl' },
  { re: /\baldi\b/i, name: 'Aldi' },
  { re: /\balcampo\b/i, name: 'Alcampo' },
  { re: /\beroski\b/i, name: 'Eroski' },
  { re: /\bconsum\b/i, name: 'Consum' },
  { re: /\bdia\s*(%|retail|market|s\.?a)/i, name: 'Dia' },
  { re: /el\s+corte\s+ingl[eé]s/i, name: 'El Corte Inglés' },
  { re: /\bhipercor\b/i, name: 'Hipercor' },
  { re: /\bsupercor\b/i, name: 'Supercor' },
  { re: /ahorram[aá]s/i, name: 'Ahorramás' },
  { re: /\bcaprabo\b/i, name: 'Caprabo' },
  { re: /\bbonpreu\b/i, name: 'Bonpreu' },
  { re: /\bcondis\b/i, name: 'Condis' },
  { re: /\bgadis\b/i, name: 'Gadis' },
  { re: /\bfroiz\b/i, name: 'Froiz' },
  { re: /\bcovir[aá]n\b/i, name: 'Covirán' },
  { re: /\bhiperdino\b/i, name: 'HiperDino' },
  { re: /\bspar\b/i, name: 'Spar' },
  { re: /\bmakro\b/i, name: 'Makro' },
  { re: /\bsimply\b/i, name: 'Simply' },
  { re: /\bmasymas\b/i, name: 'Masymas' },
  { re: /\bbm\s+supermercados?\b/i, name: 'BM Supermercados' },
  { re: /\bcostco\b/i, name: 'Costco' },
  { re: /\bdecathlon\b/i, name: 'Decathlon' },
  { re: /\bikea\b/i, name: 'IKEA' },
  { re: /\bleroy\s+merlin\b/i, name: 'Leroy Merlin' },
  { re: /\bprimor\b/i, name: 'Primor' },
  { re: /\bdruni\b/i, name: 'Druni' },
];

export function letterCount(s: string): number {
  return (s.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
}
