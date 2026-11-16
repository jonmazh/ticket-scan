import { getDemoDb, __setTestDb, deleteDemoDatabase } from '@/database/db';
import type { DraftItem, ReceiptDraft } from '@/types/drafts';
import type { QuantityUnit } from '@/types/models';
import { newId } from '@/utils/id';
import { lastMonths } from '@/utils/dates';
import { createReceipt } from './receiptService';

/**
 * Modo demostración: genera datos FICTICIOS en una base de datos separada
 * ("ticketscan-demo"). Nunca se mezclan con el histórico real y se pueden
 * borrar por completo desde Ajustes.
 */

const DEMO_STORES = ['Supermercado Demo', 'Frutería Ejemplo', 'Mercado Ficticio'];
const DEMO_PRODUCTS: [string, number, QuantityUnit, number][] = [
  ['Leche entera 1L', 120, 'ud', 1],
  ['Pan de molde', 150, 'ud', 1],
  ['Huevos L (12)', 320, 'ud', 1],
  ['Aceite de oliva 1L', 850, 'ud', 1],
  ['Manzanas', 240, 'kg', 1.25],
  ['Yogur natural (4)', 110, 'ud', 2],
  ['Café molido 250g', 399, 'ud', 1],
  ['Plátanos', 199, 'kg', 0.9],
  ['Arroz 1kg', 135, 'ud', 1],
  ['Tomate triturado', 89, 'ud', 3],
];

function item(name: string, unitPrice: number, unit: QuantityUnit, qty: number): DraftItem {
  return {
    key: newId(),
    rawName: name.toUpperCase(),
    productName: name,
    quantity: qty,
    unit,
    unitPriceCents: unitPrice,
    lineTotalCents: Math.round(unitPrice * qty),
    originalOcrLine: '',
    extractionConfidence: 1,
    productId: null,
    productAssignment: 'auto',
  };
}

/** Rellena la base de datos de demostración con unos 18 tickets ficticios. */
export async function seedDemoData(today = new Date()): Promise<void> {
  await deleteDemoDatabase();
  const db = getDemoDb();
  __setTestDb(db);
  try {
    const months = lastMonths(today.getFullYear(), today.getMonth() + 1, 6);
    let seed = 7;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (const m of months) {
      for (let t = 0; t < 3; t++) {
        const lastDay = new Date(m.year, m.month, 0).getDate();
        const maxDay = m.year === today.getFullYear() && m.month === today.getMonth() + 1 ? today.getDate() : lastDay;
        const day = 1 + Math.floor(rand() * maxDay);
        const chosen = DEMO_PRODUCTS.filter(() => rand() > 0.45);
        const items = (chosen.length ? chosen : DEMO_PRODUCTS.slice(0, 2)).map(([n, p, u, q]) =>
          item(n, p + Math.round((rand() - 0.5) * 10), u, q),
        );
        const total = items.reduce((s, i) => s + i.lineTotalCents, 0);
        const draft: ReceiptDraft = {
          merchantName: DEMO_STORES[Math.floor(rand() * DEMO_STORES.length)],
          merchantAddress: '',
          merchantTaxId: '',
          purchaseDate: `${m.key}-${String(day).padStart(2, '0')}`,
          purchaseTime: `${String(9 + Math.floor(rand() * 11)).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}`,
          dateEstimated: false,
          merchantReference: '',
          currency: 'EUR',
          printedTotalCents: total,
          subtotalCents: null,
          notes: 'Ticket de demostración (datos ficticios).',
          ocrText: '',
          extractionStatus: 'manual',
          items,
          adjustments: [],
        };
        await createReceipt(draft, null, { now: new Date(m.year, m.month - 1, day, 12) });
      }
    }
  } finally {
    __setTestDb(null);
  }
}
