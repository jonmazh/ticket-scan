import type { Product, QuantityUnit, Receipt, ReceiptItem } from '@/types/models';
import { isInRange, monthKey, type DateRange } from '@/utils/dates';
import { effectiveTotal } from './receiptService';

/**
 * Cálculos estadísticos puros (sin acceso a base de datos) para poder probarlos.
 * Siempre se usa la FECHA DE COMPRA, nunca la fecha de creación del registro.
 */

export interface PeriodSummary {
  totalCents: number;
  receiptCount: number;
  /** Unidades: suma de cantidades en "ud" + 1 por cada línea a peso/volumen. */
  units: number;
  lineCount: number;
}

export function unitsOf(items: Pick<ReceiptItem, 'quantity' | 'unit'>[]): number {
  let u = 0;
  for (const it of items) u += it.unit === 'ud' ? it.quantity : 1;
  return Math.round(u * 1000) / 1000;
}

export function filterReceipts(receipts: Receipt[], range: DateRange): Receipt[] {
  return receipts.filter((r) => isInRange(r.purchaseDate, range));
}

export function filterItems(items: ReceiptItem[], range: DateRange): ReceiptItem[] {
  return items.filter((i) => isInRange(i.purchaseDate, range));
}

export function summarize(receipts: Receipt[], items: ReceiptItem[], range: DateRange): PeriodSummary {
  const rs = filterReceipts(receipts, range);
  const its = filterItems(items, range);
  return {
    totalCents: rs.reduce((s, r) => s + effectiveTotal(r), 0),
    receiptCount: rs.length,
    units: unitsOf(its),
    lineCount: its.length,
  };
}

export function monthlyTotals(receipts: Receipt[], monthKeys: string[]): Map<string, number> {
  const out = new Map<string, number>(monthKeys.map((k) => [k, 0]));
  for (const r of receipts) {
    const k = monthKey(r.purchaseDate);
    if (out.has(k)) out.set(k, out.get(k)! + effectiveTotal(r));
  }
  return out;
}

export interface ComparisonResult {
  diffCents: number;
  /** Variación porcentual; null si el periodo anterior no tiene gasto. */
  percent: number | null;
}

export function compare(current: number, previous: number): ComparisonResult {
  return {
    diffCents: current - previous,
    percent: previous > 0 ? ((current - previous) / previous) * 100 : null,
  };
}

export interface ProductStat {
  productId: string;
  name: string;
  category: string;
  totalCents: number;
  /** Cantidad total en la unidad principal. */
  quantity: number;
  unit: QuantityUnit;
  /** true si hay líneas con unidades distintas (p. ej. ud y kg). */
  mixedUnits: boolean;
  units: number;
  /** Precio medio por unidad (solo si todas las líneas usan la misma unidad). */
  avgUnitPriceCents: number | null;
  lastPurchaseDate: string;
  receiptCount: number;
  lineCount: number;
}

/** Agrupa las líneas por producto respetando el periodo indicado. */
export function groupByProduct(items: ReceiptItem[], products: Product[], range: DateRange): ProductStat[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const groups = new Map<string, ReceiptItem[]>();
  for (const it of items) {
    if (!isInRange(it.purchaseDate, range)) continue;
    const list = groups.get(it.productId);
    if (list) list.push(it);
    else groups.set(it.productId, [it]);
  }
  const stats: ProductStat[] = [];
  for (const [productId, list] of groups) {
    const p = byId.get(productId);
    const qtyByUnit = new Map<QuantityUnit, number>();
    for (const it of list) qtyByUnit.set(it.unit, (qtyByUnit.get(it.unit) ?? 0) + it.quantity);
    let unit: QuantityUnit = 'ud';
    let best = -1;
    for (const [u, q] of qtyByUnit) {
      if (q > best) {
        best = q;
        unit = u;
      }
    }
    const totalCents = list.reduce((s, it) => s + it.lineTotalCents, 0);
    const mixedUnits = qtyByUnit.size > 1;
    const quantity = Math.round((qtyByUnit.get(unit) ?? 0) * 1000) / 1000;
    stats.push({
      productId,
      name: p?.canonicalName ?? list[0].productName,
      category: p?.category ?? '',
      totalCents,
      quantity,
      unit,
      mixedUnits,
      units: unitsOf(list),
      avgUnitPriceCents: !mixedUnits && quantity > 0 ? Math.round(totalCents / quantity) : null,
      lastPurchaseDate: list.reduce((m, it) => (it.purchaseDate > m ? it.purchaseDate : m), ''),
      receiptCount: new Set(list.map((it) => it.receiptId)).size,
      lineCount: list.length,
    });
  }
  return stats;
}

export type ProductSort = 'name' | 'spent' | 'units' | 'recent';

export function sortProductStats(stats: ProductStat[], sort: ProductSort): ProductStat[] {
  const copy = [...stats];
  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  switch (sort) {
    case 'name':
      return copy.sort((a, b) => collator.compare(a.name, b.name));
    case 'spent':
      return copy.sort((a, b) => b.totalCents - a.totalCents || collator.compare(a.name, b.name));
    case 'units':
      return copy.sort((a, b) => b.units - a.units || b.totalCents - a.totalCents);
    case 'recent':
      return copy.sort((a, b) => b.lastPurchaseDate.localeCompare(a.lastPurchaseDate) || b.totalCents - a.totalCents);
  }
}

export interface TopProduct extends ProductStat {
  percent: number;
}

/** Los n productos con mayor gasto y su porcentaje sobre el gasto en productos del periodo. */
export function topProducts(stats: ProductStat[], n = 5): TopProduct[] {
  const total = stats.reduce((s, p) => s + Math.max(0, p.totalCents), 0);
  return sortProductStats(stats, 'spent')
    .slice(0, n)
    .map((p) => ({ ...p, percent: total > 0 ? (p.totalCents / total) * 100 : 0 }));
}
