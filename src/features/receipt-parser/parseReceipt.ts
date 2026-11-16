import { lineTotalFrom, unitPriceFrom } from '@/utils/money';
import { prettifyProductName } from '@/utils/normalize';
import { splitLinesDetailed, isSeparatorLine } from './cleanText';
import {
  detectAddress,
  detectDateTime,
  detectMerchant,
  detectMerchantReference,
  detectTaxId,
  findDatesInLine,
  looksLikePhone,
} from './metadata';
import { detectQuantityColumn, isNameOnlyLine, matchItemLine, pricesInLine, type ItemMatch } from './itemRules';
import { KEYWORDS, letterCount } from './patterns';
import { isSubtotalLine, isTaxHeader, isTotalLine, parseDiscountLine, parseRefundLine, parseTaxRow } from './totals';
import type { ClassifiedLine, LineKind, ParseOptions, ParsedAdjustment, ParsedItem, ParsedReceipt, ReviewField } from './types';

/**
 * Orquestador del sistema de extracción.
 *   1. Limpieza del texto            -> cleanText.ts
 *   2. Detección de líneas            -> splitLines + clasificación aquí
 *   3-7. Productos, cantidades, precios unitarios e importes -> itemRules.ts
 *   8-10. Descuentos, impuestos y total -> totals.ts
 *   11-12. Fecha y establecimiento   -> metadata.ts
 * Todo lo extraído pasa después por la pantalla de revisión editable.
 */

const RULE_CONFIDENCE: Record<string, number> = {
  weight: 0.9,
  'detail-with-total': 0.85,
  'name-qty-x-price-total': 0.9,
  'qty-x-name-total': 0.85,
  'qtycol-name-unit-total': 0.9,
  'qtycol-name-total': 0.85,
  'name-unit-total': 0.85,
  'name-two-prices': 0.5,
  'name-total': 0.8,
  'weight-recomputed': 0.4,
};

/** Confianza máxima de una línea cuyo importe se ha reparado en la limpieza. */
const REPAIRED_MAX_CONFIDENCE = 0.45;

function nameQuality(name: string): number {
  const compact = name.replace(/\s/g, '');
  if (!compact) return 0;
  const ratio = letterCount(compact) / compact.length;
  if (ratio < 0.4) return -0.3;
  if (ratio < 0.6) return -0.15;
  return 0;
}

function buildItem(match: ItemMatch, name: string, originalLine: string): ParsedItem | null {
  const total = match.lineTotalCents;
  if (total === null) return null;
  let quantity = match.quantity ?? null;
  let unitPrice = match.unitPriceCents ?? null;
  let confidence = RULE_CONFIDENCE[match.rule] ?? 0.7;

  if (quantity === null && unitPrice !== null && unitPrice > 0) {
    const k = total / unitPrice;
    if (Math.abs(k - Math.round(k)) < 0.02) quantity = Math.round(k);
  }
  if (quantity === null) quantity = 1;
  if (unitPrice === null) unitPrice = unitPriceFrom(total, quantity);
  else if (Math.abs(lineTotalFrom(quantity, unitPrice) - total) > 2) confidence = Math.min(confidence, 0.5);

  confidence = Math.max(0.1, Math.min(1, confidence + nameQuality(name)));
  const rawName = name.trim();
  return {
    rawName,
    name: prettifyProductName(rawName),
    quantity,
    unit: match.unit ?? 'ud',
    unitPriceCents: unitPrice,
    lineTotalCents: total,
    originalLine,
    confidence: Math.round(confidence * 100) / 100,
    rule: match.rule,
  };
}

function isNoiseLine(line: string, taxId: string): boolean {
  if (looksLikePhone(line)) return true;
  if (taxId && line.replace(/[\s-]/g, '').toUpperCase().includes(taxId)) return true;
  if (KEYWORDS.info.test(line) && pricesInLine(line).length === 0) return true;
  return false;
}

export function parseReceipt(text: string, options: ParseOptions = {}): ParsedReceipt {
  const today = options.today ?? new Date();
  const detailed = splitLinesDetailed(text ?? '');
  const lines = detailed.map((l) => l.text);
  const repairedLine = (i: number) => detailed[i]?.repaired === true;
  const classified: ClassifiedLine[] = lines.map((t, index) => ({
    index,
    text: t,
    kind: t === '' ? 'empty' : isSeparatorLine(t) ? 'separator' : 'unknown',
  }));
  const setKind = (i: number, kind: LineKind) => {
    classified[i].kind = kind;
  };

  // --- Metadatos -----------------------------------------------------------
  const { date, time, dateLine } = detectDateTime(lines, today);
  if (dateLine >= 0) setKind(dateLine, 'date');
  const merchantTaxId = detectTaxId(lines);
  const merchantAddress = detectAddress(lines);
  const merchant = detectMerchant(lines);
  const merchantReference = detectMerchantReference(lines);
  const quantityColumn = detectQuantityColumn(lines);

  // --- Candidatos a total ---------------------------------------------------
  const totalCandidates: { index: number; amount: number }[] = [];
  lines.forEach((line, i) => {
    if (!isTotalLine(line)) return;
    let prices = pricesInLine(line);
    if (prices.length === 0 && i + 1 < lines.length) {
      const next = lines[i + 1];
      if (letterCount(next) === 0) prices = pricesInLine(next);
    }
    if (prices.length > 0) totalCandidates.push({ index: i, amount: prices[prices.length - 1] });
    setKind(i, 'total');
  });
  const itemRegionEnd = totalCandidates.length > 0 ? totalCandidates[0].index : lines.length;

  // --- Recorrido de líneas ----------------------------------------------------
  const items: ParsedItem[] = [];
  const adjustments: ParsedAdjustment[] = [];
  const taxRows: { rate: string; cuotaCents: number; line: string }[] = [];
  let taxTotalOverride: number | null = null;
  let subtotalCents: number | null = null;
  let pendingName: { text: string; index: number } | null = null;
  let pendingDetail: ItemMatch | null = null;
  let inTaxTable = false;
  let lastItemLine = -1;
  const pushItem = (item: ParsedItem, lineIndex: number) => {
    if (repairedLine(lineIndex)) item.confidence = Math.min(item.confidence, REPAIRED_MAX_CONFIDENCE);
    items.push(item);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const c = classified[i];
    if (c.kind === 'empty' || c.kind === 'separator') {
      inTaxTable = inTaxTable && c.kind !== 'empty';
      continue;
    }
    const afterItems = i >= itemRegionEnd;

    // Impuestos (en cualquier parte del ticket)
    if (isTaxHeader(line)) {
      inTaxTable = true;
      setKind(i, 'tax');
      continue;
    }
    if (/\btotal\b/i.test(line) && KEYWORDS.tax.test(line) && /iva|cuota|impuesto/i.test(line)) {
      const p = pricesInLine(line);
      if (p.length > 0) taxTotalOverride = p.length >= 2 ? p[1] : p[0];
      setKind(i, 'tax');
      continue;
    }
    const taxRow = c.kind === 'total' ? null : parseTaxRow(line, inTaxTable);
    if (taxRow) {
      taxRows.push({ ...taxRow, line });
      setKind(i, 'tax');
      continue;
    }
    if (c.kind === 'total') continue;
    if (c.kind === 'date' && pricesInLine(line).length === 0) continue;

    if (isSubtotalLine(line)) {
      const p = pricesInLine(line);
      if (p.length > 0) subtotalCents = p[p.length - 1];
      setKind(i, 'subtotal');
      continue;
    }
    if (KEYWORDS.payment.test(line)) {
      setKind(i, 'payment');
      continue;
    }
    if (KEYWORDS.discount.test(line)) {
      // "Ahorro" después del total suele ser un resumen informativo: no se suma
      if (afterItems && /ahorr/i.test(line)) {
        setKind(i, 'info');
        continue;
      }
      const d = parseDiscountLine(line);
      if (d) {
        adjustments.push(d);
        setKind(i, 'discount');
        continue;
      }
    }
    if (KEYWORDS.refund.test(line)) {
      const r = parseRefundLine(line);
      if (r) {
        adjustments.push(r);
        setKind(i, 'refund');
        continue;
      }
    }
    if (afterItems) {
      setKind(i, 'info');
      continue;
    }
    if (isNoiseLine(line, merchantTaxId) || (findDatesInLine(line, today).length > 0 && pricesInLine(line).length === 0)) {
      setKind(i, 'info');
      continue;
    }

    const match = matchItemLine(line, { quantityColumn });
    if (match) {
      const isDetail = match.name === '';
      if (isDetail) {
        // Línea de detalle "2 x 1,20 2,40" o "1,250 kg x 2,40 /kg 3,00"
        const prev = items[items.length - 1];
        const prevIsAdjacent = prev && lastItemLine >= 0 && i - lastItemLine <= 2;
        const q = match.quantity;
        const up = match.unitPriceCents;
        if (pendingName && pendingName.index >= i - 2 && match.lineTotalCents !== null) {
          const item = buildItem(match, pendingName.text, `${pendingName.text} | ${line}`);
          if (item) {
            pushItem(item, i);
            lastItemLine = i;
            setKind(pendingName.index, 'item-name');
            setKind(i, 'item-detail');
          }
          pendingName = null;
          continue;
        }
        if (prevIsAdjacent && q !== null && up !== null) {
          const expected = lineTotalFrom(q, up);
          const total = match.lineTotalCents ?? expected;
          if (Math.abs(prev.lineTotalCents - total) <= 2 && Math.abs(expected - total) <= 2) {
            prev.quantity = q;
            prev.unit = match.unit ?? prev.unit;
            prev.unitPriceCents = up;
            prev.originalLine = `${prev.originalLine} | ${line}`;
            prev.confidence = Math.max(prev.confidence, 0.9);
            setKind(i, 'item-detail');
            continue;
          }
        }
        if (match.lineTotalCents === null) {
          pendingDetail = match;
          setKind(i, 'item-detail');
          continue;
        }
        const orphan = buildItem(match, 'Producto sin nombre', line);
        if (orphan) {
          orphan.confidence = 0.3;
          items.push(orphan);
          lastItemLine = i;
          setKind(i, 'item');
        }
        continue;
      }

      // Línea de producto con nombre
      if (pendingDetail && match.quantity === null && match.lineTotalCents !== null) {
        const pq = pendingDetail.quantity;
        const pu = pendingDetail.unitPriceCents;
        if (pq !== null && pu !== null && Math.abs(lineTotalFrom(pq, pu) - match.lineTotalCents) <= 2) {
          match.quantity = pq;
          match.unitPriceCents = pu;
          match.unit = pendingDetail.unit;
        }
      }
      pendingDetail = null;
      pendingName = null;

      if (match.lineTotalCents !== null && match.lineTotalCents < 0) {
        adjustments.push({
          description: prettifyProductName(match.name) || 'Devolución',
          type: 'refund',
          amountCents: match.lineTotalCents,
          affectsTotal: true,
          originalLine: line,
        });
        setKind(i, 'refund');
        continue;
      }
      const item = buildItem(match, match.name, line);
      if (item) {
        pushItem(item, i);
        lastItemLine = i;
        setKind(i, 'item');
      }
      continue;
    }

    if (isNameOnlyLine(line)) {
      pendingName = { text: line.replace(/^\d{6,14}\s+/, ''), index: i };
      setKind(i, items.length === 0 && i < 6 ? 'header' : 'unknown');
      continue;
    }
    setKind(i, items.length === 0 ? 'header' : 'unknown');
  }

  // --- Impuestos --------------------------------------------------------------
  let taxCents: number | null = null;
  const rowsSum = taxRows.reduce((s, r) => s + r.cuotaCents, 0);
  if (taxRows.length > 0) {
    taxCents = taxTotalOverride ?? rowsSum;
    if (taxTotalOverride === null || Math.abs(taxTotalOverride - rowsSum) <= 2) {
      for (const r of taxRows) {
        adjustments.push({
          description: r.rate ? `IVA ${r.rate}` : 'IVA',
          type: 'tax',
          amountCents: r.cuotaCents,
          affectsTotal: false,
          originalLine: r.line,
        });
      }
    } else {
      adjustments.push({ description: 'IVA', type: 'tax', amountCents: taxTotalOverride, affectsTotal: false, originalLine: '' });
    }
  } else if (taxTotalOverride !== null) {
    taxCents = taxTotalOverride;
    adjustments.push({ description: 'IVA', type: 'tax', amountCents: taxTotalOverride, affectsTotal: false, originalLine: '' });
  }

  // --- Total ------------------------------------------------------------------
  const itemsSum = items.reduce((s, it) => s + it.lineTotalCents, 0);
  const adjSum = adjustments.filter((a) => a.affectsTotal).reduce((s, a) => s + a.amountCents, 0);
  const computed = itemsSum + adjSum;
  let totalCents: number | null = null;
  if (totalCandidates.length > 0) {
    const exact = totalCandidates.find((t) => t.amount === computed);
    totalCents = exact ? exact.amount : totalCandidates[0].amount;
  } else {
    // Sin línea TOTAL: el pago con tarjeta suele coincidir con el total
    for (const line of lines) {
      if (/\b(tarjeta|visa|mastercard|contactless)\b/i.test(line)) {
        const p = pricesInLine(line);
        if (p.length > 0) {
          totalCents = p[p.length - 1];
          break;
        }
      }
    }
  }

  // --- Revisión ---------------------------------------------------------------
  const needsReview: ReviewField[] = [];
  const warnings: string[] = [];
  if (!merchant.name || !merchant.confident) needsReview.push('merchant');
  if (!date) {
    needsReview.push('date');
    warnings.push('No se ha reconocido la fecha de compra.');
  }
  if (totalCents === null) {
    needsReview.push('total');
    warnings.push('No se ha encontrado el total del ticket.');
  } else if (totalCandidates.length === 0) {
    needsReview.push('total');
  }
  if (items.length === 0) {
    needsReview.push('items');
    warnings.push('No se han detectado productos.');
  } else if (items.some((it) => it.confidence < 0.6)) {
    needsReview.push('items');
    warnings.push('Algunas líneas tienen baja confianza. Revísalas.');
  }
  if (totalCents !== null && items.length > 0 && totalCents !== computed) {
    warnings.push('El importe de los productos no coincide con el total del ticket.');
  }

  return {
    merchantName: merchant.name,
    merchantAddress,
    merchantTaxId,
    purchaseDate: date,
    purchaseTime: time,
    merchantReference,
    subtotalCents,
    totalCents,
    taxCents,
    items,
    adjustments,
    needsReview,
    warnings,
    lines: classified,
  };
}
