import type {
  AdjustmentType,
  CurrencyCode,
  ExtractionStatus,
  ProductAssignment,
  QuantityUnit,
} from './models';

/** Línea editable en la pantalla de revisión. */
export interface DraftItem {
  /** Clave estable para React. */
  key: string;
  /** Id de la línea guardada (al editar un ticket existente). */
  id?: string;
  rawName: string;
  productName: string;
  quantity: number;
  unit: QuantityUnit;
  unitPriceCents: number;
  lineTotalCents: number;
  originalOcrLine: string;
  extractionConfidence: number;
  /** Producto asignado manualmente; null = agrupar automáticamente por nombre. */
  productId: string | null;
  productAssignment: ProductAssignment;
}

export interface DraftAdjustment {
  key: string;
  id?: string;
  description: string;
  type: AdjustmentType;
  amountCents: number;
  affectsTotal: boolean;
}

export interface ReceiptDraft {
  merchantName: string;
  merchantAddress: string;
  merchantTaxId: string;
  purchaseDate: string;
  purchaseTime: string;
  dateEstimated: boolean;
  merchantReference: string;
  currency: CurrencyCode;
  printedTotalCents: number | null;
  subtotalCents: number | null;
  notes: string;
  ocrText: string;
  extractionStatus: ExtractionStatus;
  items: DraftItem[];
  adjustments: DraftAdjustment[];
}

export interface ImageVariant {
  blob: Blob;
  width: number;
  height: number;
}

/** Imágenes asociadas a un ticket nuevo. */
export interface ReceiptImages {
  original: ImageVariant;
  processed?: ImageVariant | null;
  thumbnail: ImageVariant;
  contentHash: string;
  perceptualHash: string;
}
