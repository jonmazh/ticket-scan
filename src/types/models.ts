/**
 * Modelo de datos de TicketScan.
 * Todos los importes monetarios se guardan como enteros en céntimos.
 * Las fechas de compra se guardan como cadenas locales "YYYY-MM-DD" para
 * evitar desplazamientos por zona horaria.
 */

export type CurrencyCode = 'EUR' | 'USD' | 'GBP';

/** Unidad de compra de una línea. */
export type QuantityUnit = 'ud' | 'kg' | 'g' | 'l' | 'ml';

export type ExtractionStatus =
  | 'manual' // introducido a mano
  | 'ocr' // extraído por OCR y revisado antes de guardar
  | 'ocr-failed'; // el OCR falló y se completó manualmente

export type AdjustmentType = 'discount' | 'tax' | 'charge' | 'refund' | 'other';

export type ImageKind = 'original' | 'processed' | 'thumbnail';

export interface Receipt {
  id: string;
  /** Referencia interna única, p. ej. TKT-2026-0001. No cambia al editar. */
  reference: string;
  referenceYear: number;
  referenceSeq: number;
  merchantName: string;
  merchantAddress: string;
  merchantTaxId: string;
  /** Fecha de compra local YYYY-MM-DD. */
  purchaseDate: string;
  /** Hora local HH:mm o cadena vacía. */
  purchaseTime: string;
  /** true si la fecha no se reconoció y se usa la fecha de captura. */
  dateEstimated: boolean;
  /** Referencia original del establecimiento (nº de ticket/factura). */
  merchantReference: string;
  currency: CurrencyCode;
  /** Total impreso en el ticket (oficial). null si no se conoce. */
  printedTotalCents: number | null;
  /** Suma calculada de las líneas de producto. */
  calculatedItemsTotalCents: number;
  /** Suma de ajustes que afectan al total (descuentos, devoluciones, cargos). */
  adjustmentsTotalCents: number;
  /** Subtotal impreso, si existe. */
  subtotalCents: number | null;
  notes: string;
  /** Imagen original tal como se capturó (tabla images). */
  originalImageId: string | null;
  /** Imagen preparada para OCR (recortada/rotada/contrastada), opcional. */
  processedImageId: string | null;
  thumbnailImageId: string | null;
  ocrText: string;
  extractionStatus: ExtractionStatus;
  createdAt: string;
  updatedAt: string;
  /** SHA-256 de la fotografía original (detección de duplicados). */
  contentHash: string;
  /** Hash perceptual (dHash 64 bits en hexadecimal). */
  perceptualHash: string;
}

export type ProductAssignment = 'auto' | 'manual';

export interface ReceiptItem {
  id: string;
  receiptId: string;
  productId: string;
  /** Nombre tal como se leyó del ticket (OCR) o se introdujo inicialmente. */
  rawName: string;
  /** Nombre de la línea tras la revisión del usuario. */
  productName: string;
  normalizedName: string;
  quantity: number;
  unit: QuantityUnit;
  unitPriceCents: number;
  lineTotalCents: number;
  originalOcrLine: string;
  /** Confianza de la extracción entre 0 y 1 (1 = introducido a mano). */
  extractionConfidence: number;
  productAssignment: ProductAssignment;
  /** Copia de la fecha de compra del ticket para filtrar por periodo. */
  purchaseDate: string;
  position: number;
  createdAt: string;
}

export interface Product {
  id: string;
  canonicalName: string;
  normalizedName: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductAlias {
  id: string;
  productId: string;
  alias: string;
  normalizedAlias: string;
}

export interface ReceiptAdjustment {
  id: string;
  receiptId: string;
  description: string;
  type: AdjustmentType;
  /** Con signo: descuentos y devoluciones negativos, cargos positivos. */
  amountCents: number;
  /** Los impuestos (IVA) suelen estar incluidos en el precio: solo informativos. */
  affectsTotal: boolean;
}

export interface StoredImage {
  id: string;
  receiptId: string;
  kind: ImageKind;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  createdAt: string;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export interface ReferenceCounter {
  year: number;
  lastSeq: number;
}

export type PhotoQuality = 'original' | 'high' | 'medium';
export type OcrLanguage = 'spa' | 'eng';
export type DateFormatPreference = 'dd/MM/yyyy' | 'd MMM yyyy';

export interface AppSettings {
  language: 'es';
  currency: CurrencyCode;
  dateFormat: DateFormatPreference;
  photoQuality: PhotoQuality;
  ocrLanguages: OcrLanguage[];
  /** Modo de segmentación de página de Tesseract. */
  ocrPageSegMode: '3' | '4' | '6';
  /** Mejora de imagen por defecto antes del OCR. */
  defaultEnhancement: EnhancementMode;
  lastBackupAt: string | null;
}

export type EnhancementMode = 'none' | 'contrast' | 'bw';
