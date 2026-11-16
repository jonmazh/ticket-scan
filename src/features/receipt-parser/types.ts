import type { AdjustmentType, QuantityUnit } from '@/types/models';

export type LineKind =
  | 'empty'
  | 'separator'
  | 'header'
  | 'item'
  | 'item-detail'
  | 'item-name'
  | 'discount'
  | 'refund'
  | 'tax'
  | 'subtotal'
  | 'total'
  | 'payment'
  | 'date'
  | 'info'
  | 'unknown';

export interface ClassifiedLine {
  index: number;
  text: string;
  kind: LineKind;
}

export interface ParsedItem {
  rawName: string;
  name: string;
  quantity: number;
  unit: QuantityUnit;
  unitPriceCents: number;
  lineTotalCents: number;
  originalLine: string;
  /** 0..1: lo segura que es la extracción. */
  confidence: number;
  /** Regla que reconoció la línea (para depurar y ampliar el parser). */
  rule: string;
}

export interface ParsedAdjustment {
  description: string;
  type: AdjustmentType;
  amountCents: number;
  affectsTotal: boolean;
  originalLine: string;
}

export type ReviewField = 'merchant' | 'date' | 'total' | 'items' | 'reference';

export interface ParsedReceipt {
  merchantName: string;
  merchantAddress: string;
  merchantTaxId: string;
  purchaseDate: string | null;
  purchaseTime: string | null;
  merchantReference: string;
  subtotalCents: number | null;
  totalCents: number | null;
  taxCents: number | null;
  items: ParsedItem[];
  adjustments: ParsedAdjustment[];
  /** Campos que conviene revisar porque no se han identificado con seguridad. */
  needsReview: ReviewField[];
  warnings: string[];
  lines: ClassifiedLine[];
}

export interface ParseOptions {
  /** Fecha de referencia para validar años plausibles (por defecto hoy). */
  today?: Date;
}
