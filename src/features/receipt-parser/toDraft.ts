import type { ReceiptDraft } from '@/types/drafts';
import type { CurrencyCode, ExtractionStatus } from '@/types/models';
import { newId } from '@/utils/id';
import { toLocalDate } from '@/utils/dates';
import type { ParsedReceipt } from './types';

/** Borrador vacío para introducir un ticket a mano. */
export function emptyDraft(currency: CurrencyCode, captureDate = new Date(), status: ExtractionStatus = 'manual'): ReceiptDraft {
  return {
    merchantName: '',
    merchantAddress: '',
    merchantTaxId: '',
    purchaseDate: toLocalDate(captureDate),
    purchaseTime: '',
    dateEstimated: status !== 'manual',
    merchantReference: '',
    currency,
    printedTotalCents: null,
    subtotalCents: null,
    notes: '',
    ocrText: '',
    extractionStatus: status,
    items: [],
    adjustments: [],
  };
}

/**
 * Convierte el resultado del parser en un borrador editable.
 * Si no se reconoce la fecha, se usa la de captura marcada como estimada.
 */
export function parsedToDraft(parsed: ParsedReceipt, ocrText: string, currency: CurrencyCode, captureDate = new Date()): ReceiptDraft {
  return {
    merchantName: parsed.merchantName,
    merchantAddress: parsed.merchantAddress,
    merchantTaxId: parsed.merchantTaxId,
    purchaseDate: parsed.purchaseDate ?? toLocalDate(captureDate),
    purchaseTime: parsed.purchaseTime ?? '',
    dateEstimated: !parsed.purchaseDate,
    merchantReference: parsed.merchantReference,
    currency,
    printedTotalCents: parsed.totalCents,
    subtotalCents: parsed.subtotalCents,
    notes: '',
    ocrText,
    extractionStatus: parsed.items.length > 0 ? 'ocr' : 'ocr-failed',
    items: parsed.items.map((it) => ({
      key: newId(),
      rawName: it.rawName,
      productName: it.name,
      quantity: it.quantity,
      unit: it.unit,
      unitPriceCents: it.unitPriceCents,
      lineTotalCents: it.lineTotalCents,
      originalOcrLine: it.originalLine,
      extractionConfidence: it.confidence,
      productId: null,
      productAssignment: 'auto',
    })),
    adjustments: parsed.adjustments.map((a) => ({
      key: newId(),
      description: a.description,
      type: a.type,
      amountCents: a.amountCents,
      affectsTotal: a.affectsTotal,
    })),
  };
}
