import type { QuantityUnit } from '@/types/models';
import { parseAmount, parseQuantity, lineTotalFrom } from '@/utils/money';
import { PRICE, QTY, UNIT, TIMES, letterCount } from './patterns';

/**
 * Reglas de reconocimiento de líneas de producto.
 * Cada regla es independiente: para soportar un formato nuevo de ticket basta
 * con añadir una regla a ITEM_RULES (el orden importa: de más a menos específica).
 */

export interface ItemMatch {
  /** Nombre del producto (vacío en líneas de detalle "2 x 1,20 2,40"). */
  name: string;
  quantity: number | null;
  unit: QuantityUnit | null;
  unitPriceCents: number | null;
  lineTotalCents: number | null;
  rule: string;
}

export interface RuleContext {
  /** El ticket tiene columna de cantidad al principio de cada línea (formato tipo Mercadona). */
  quantityColumn: boolean;
}

export interface ItemRule {
  id: string;
  /** true si la regla describe solo detalle (cantidad/precio) sin nombre. */
  detailOnly?: boolean;
  match(line: string, ctx: RuleContext): ItemMatch | null;
}

/** Prepara la línea para las reglas: separa "x", normaliza "€/kg" y elimina códigos de IVA finales. */
export function prepareLine(line: string): string {
  let s = ` ${line} `;
  s = s.replace(/(\d)\s*[xX*]\s*(?=\d)/g, '$1 x ');
  s = s.replace(/^\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*[xX*]\s+(?=[A-Za-zÀ-ÿ])/, ' $1 x ');
  s = s.replace(/\s*(?:€|eur)?\s*\/\s*(kgs?|kilo|k|l|lt|ud|un|u)\b\.?/gi, (_m, u: string) => ` /${unitOf(u)} `);
  s = s.replace(/\s+€(?=\s)/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // Código de tipo de IVA o marca al final tras un importe: "1,20 A", "1,20 B*", "1,20 (C)"
  s = s.replace(new RegExp(`(${PRICE})\\s+(?:\\(?[A-E]\\)?\\*?|\\*|%|[A-E]\\s?\\d{1,2}%?)$`, 'i'), '$1');
  return s.trim();
}

export function unitOf(u: string | undefined | null): QuantityUnit {
  if (!u) return 'ud';
  const s = u.toLowerCase().replace(/\.$/, '');
  if (/^(kgs?|kilos?|k)$/.test(s)) return 'kg';
  if (/^(g|grs?)$/.test(s)) return 'g';
  if (/^(l|lts?)$/.test(s)) return 'l';
  if (s === 'ml') return 'ml';
  return 'ud';
}

function price(s: string | undefined): number | null {
  return s ? parseAmount(s, { allowInteger: false }) : null;
}

function cleanName(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^\d{6,14}\s+/, ''); // código EAN/artículo al principio
  s = s.replace(/^[-*.:#]+\s*/, '');
  s = s.replace(/\s*[-*.:#]+$/, '');
  return s.replace(/\s+/g, ' ').trim();
}

function validName(name: string): boolean {
  if (letterCount(name) < 2) return false;
  if (/^(x|kg|uds?|eur|€)$/i.test(name)) return false;
  return true;
}

const NAME = String.raw`(.*?[A-Za-zÀ-ÿ].*?)`;

export const ITEM_RULES: ItemRule[] = [
  {
    // "MANZANA GOLDEN 1,250 kg x 2,40 /kg 3,00" o "1,250 kg x 2,40 /kg 3,00" o "2,00 KG X 1,50 /kg 3,00"
    id: 'weight',
    match(line) {
      const re = new RegExp(
        `^(?:${NAME}\\s+)?(${QTY})\\s*(${UNIT})\\.?\\s*(?:${TIMES}\\s*)?(${PRICE})\\s*(?:/(kg|g|l|ud))?\\s*=?\\s*(${PRICE})$`,
        'i',
      );
      const m = re.exec(line);
      if (!m) return null;
      const name = m[1] ? cleanName(m[1]) : '';
      if (m[1] && !validName(name)) return null;
      const quantity = parseQuantity(m[2]);
      const unit = unitOf(m[5] ?? m[3]);
      const up = price(m[4]);
      const total = price(m[6]);
      if (quantity !== null && up !== null && total !== null && Math.abs(lineTotalFrom(quantity, up) - total) > 2) {
        // Línea de peso inequívoca ("x" o "/kg"): el importe está mal leído; se recalcula y se marca para revisión
        if (/\sx\s|\/(kg|g|l|ud)/i.test(line)) {
          return { name, quantity, unit, unitPriceCents: up, lineTotalCents: lineTotalFrom(quantity, up), rule: 'weight-recomputed' };
        }
        // Si no, probablemente el número era parte del nombre ("AGUA 1,5 L")
        return null;
      }
      return {
        name,
        quantity,
        unit,
        unitPriceCents: price(m[4]),
        lineTotalCents: price(m[6]),
        rule: 'weight',
      };
    },
  },
  {
    // Detalle sin nombre: "2 x 1,20 2,40", "0,500 x 2,40 = 1,20", "3 uds x 0,99 2,97"
    id: 'detail-with-total',
    detailOnly: true,
    match(line) {
      const re = new RegExp(
        `^(${QTY})\\s*(${UNIT})?\\.?\\s*${TIMES}\\s*(${PRICE})\\s*(?:/(kg|g|l|ud))?\\s*=?\\s*(${PRICE})$`,
        'i',
      );
      const m = re.exec(line);
      if (!m) return null;
      const q = parseQuantity(m[1]);
      const weighted = /[.,]\d{3}$/.test(m[1]);
      return {
        name: '',
        quantity: q,
        unit: m[4] ? unitOf(m[4]) : m[2] ? unitOf(m[2]) : weighted ? 'kg' : 'ud',
        unitPriceCents: price(m[3]),
        lineTotalCents: price(m[5]),
        rule: 'detail-with-total',
      };
    },
  },
  {
    // Detalle sin importe: "2 x 1,20" o "1,250 kg x 2,40 /kg"
    id: 'detail-no-total',
    detailOnly: true,
    match(line) {
      const re = new RegExp(`^(${QTY})\\s*(${UNIT})?\\.?\\s*${TIMES}\\s*(${PRICE})\\s*(?:/(kg|g|l|ud))?$`, 'i');
      const m = re.exec(line);
      if (!m) return null;
      const q = parseQuantity(m[1]);
      const weighted = /[.,]\d{3}$/.test(m[1]);
      return {
        name: '',
        quantity: q,
        unit: m[4] ? unitOf(m[4]) : m[2] ? unitOf(m[2]) : weighted ? 'kg' : 'ud',
        unitPriceCents: price(m[3]),
        lineTotalCents: null,
        rule: 'detail-no-total',
      };
    },
  },
  {
    // "LECHE ENTERA 2 x 1,20 2,40"
    id: 'name-qty-x-price-total',
    match(line) {
      const re = new RegExp(`^${NAME}\\s+(${QTY})\\s*(${UNIT})?\\.?\\s*${TIMES}\\s*(${PRICE})\\s+(${PRICE})$`, 'i');
      const m = re.exec(line);
      if (!m) return null;
      const name = cleanName(m[1]);
      if (!validName(name)) return null;
      return {
        name,
        quantity: parseQuantity(m[2]),
        unit: unitOf(m[3]),
        unitPriceCents: price(m[4]),
        lineTotalCents: price(m[5]),
        rule: 'name-qty-x-price-total',
      };
    },
  },
  {
    // "2 x LECHE 2,40" o "2 X LECHE ENTERA 1L 2,40"
    id: 'qty-x-name-total',
    match(line) {
      const re = new RegExp(`^(\\d{1,3})\\s*${TIMES}\\s+${NAME}\\s+(${PRICE})$`, 'i');
      const m = re.exec(line);
      if (!m) return null;
      const name = cleanName(m[2]);
      if (!validName(name)) return null;
      return {
        name,
        quantity: parseQuantity(m[1]),
        unit: 'ud',
        unitPriceCents: null,
        lineTotalCents: price(m[3]),
        rule: 'qty-x-name-total',
      };
    },
  },
  {
    // Columna de cantidad (tipo Mercadona): "2 LECHE ENTERA 0,89 1,78"
    id: 'qtycol-name-unit-total',
    match(line, ctx) {
      if (!ctx.quantityColumn) return null;
      const re = new RegExp(`^(\\d{1,2})\\s+${NAME}\\s+(${PRICE})\\s+(${PRICE})$`, 'i');
      const m = re.exec(line);
      if (!m) return null;
      const name = cleanName(m[2]);
      if (!validName(name)) return null;
      return {
        name,
        quantity: parseQuantity(m[1]),
        unit: 'ud',
        unitPriceCents: price(m[3]),
        lineTotalCents: price(m[4]),
        rule: 'qtycol-name-unit-total',
      };
    },
  },
  {
    // Columna de cantidad: "1 PAN MOLDE 1,50"
    id: 'qtycol-name-total',
    match(line, ctx) {
      if (!ctx.quantityColumn) return null;
      const re = new RegExp(`^(\\d{1,2})\\s+${NAME}\\s+(${PRICE})$`, 'i');
      const m = re.exec(line);
      if (!m) return null;
      const name = cleanName(m[2]);
      if (!validName(name)) return null;
      return {
        name,
        quantity: parseQuantity(m[1]),
        unit: 'ud',
        unitPriceCents: null,
        lineTotalCents: price(m[3]),
        rule: 'qtycol-name-total',
      };
    },
  },
  {
    // "LECHE 1,20 2,40": dos importes; si el segundo es múltiplo entero del primero, es cantidad x precio
    id: 'name-unit-total',
    match(line) {
      const re = new RegExp(`^${NAME}\\s+(${PRICE})\\s+(${PRICE})$`, 'i');
      const m = re.exec(line);
      if (!m) return null;
      const name = cleanName(m[1]);
      if (!validName(name)) return null;
      const a = price(m[2]);
      const b = price(m[3]);
      if (a === null || b === null) return null;
      if (a > 0 && b > 0) {
        const k = b / a;
        const rk = Math.round(k);
        if (rk >= 1 && rk <= 99 && Math.abs(lineTotalFrom(rk, a) - b) <= 1) {
          return { name, quantity: rk, unit: 'ud', unitPriceCents: a, lineTotalCents: b, rule: 'name-unit-total' };
        }
      }
      // No es coherente: tomamos el último importe como total y dejamos la cantidad sin determinar
      return { name, quantity: null, unit: null, unitPriceCents: null, lineTotalCents: b, rule: 'name-two-prices' };
    },
  },
  {
    // "LECHE ENTERA 1L 1,20"
    id: 'name-total',
    match(line) {
      const re = new RegExp(`^${NAME}\\s+(${PRICE})$`, 'i');
      const m = re.exec(line);
      if (!m) return null;
      const name = cleanName(m[1]);
      if (!validName(name)) return null;
      return {
        name,
        quantity: null,
        unit: null,
        unitPriceCents: null,
        lineTotalCents: price(m[2]),
        rule: 'name-total',
      };
    },
  },
];

export function matchItemLine(line: string, ctx: RuleContext): ItemMatch | null {
  const prepared = prepareLine(line);
  for (const rule of ITEM_RULES) {
    const m = rule.match(prepared, ctx);
    if (m) return m;
  }
  return null;
}

/** Línea que parece solo un nombre de producto (sin importes). */
export function isNameOnlyLine(line: string): boolean {
  const s = line.trim();
  if (letterCount(s) < 3) return false;
  if (new RegExp(PRICE).test(s)) return false;
  if (/\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(s)) return false;
  return letterCount(s) / s.replace(/\s/g, '').length >= 0.5;
}

/** Todos los importes con 2 decimales de una línea, en orden. */
export function pricesInLine(line: string): number[] {
  const out: number[] = [];
  const re = new RegExp(`(^|\\s|[:=])(${PRICE})(?=\\s|$|€|[A-E]\\b|%)`, 'gi');
  let m: RegExpExecArray | null;
  const s = prepareLine(line);
  while ((m = re.exec(s))) {
    const v = parseAmount(m[2], { allowInteger: false });
    if (v !== null) out.push(v);
  }
  return out;
}

/** Detecta si el ticket usa columna de cantidad (la mayoría de líneas con importe empiezan por un entero pequeño). */
export function detectQuantityColumn(lines: string[]): boolean {
  let withPrice = 0;
  let withLeadingQty = 0;
  const priceEnd = new RegExp(`(${PRICE})$`);
  const leading = /^\d{1,2}\s+[A-Za-zÀ-ÿ]/;
  for (const raw of lines) {
    const line = prepareLine(raw);
    if (!priceEnd.test(line) || letterCount(line) < 3) continue;
    if (/total|iva|tarjeta|efectivo|cambio|entregado|base/i.test(line)) continue;
    withPrice++;
    if (leading.test(line)) withLeadingQty++;
  }
  return withPrice >= 2 && withLeadingQty / withPrice >= 0.6;
}
