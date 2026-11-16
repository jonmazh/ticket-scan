/**
 * Esquema versionado de IndexedDB (Dexie).
 * Para añadir una migración: añade una entrada nueva al final de SCHEMA_VERSIONS
 * con el número siguiente, las tablas que cambian y, si hace falta, una función
 * upgrade en migrations.ts. Nunca modifiques versiones anteriores.
 */

export const DB_NAME = 'ticketscan';
export const DEMO_DB_NAME = 'ticketscan-demo';

export const SCHEMA_V1 = {
  receipts: 'id, &reference, purchaseDate, createdAt, contentHash, merchantName',
  receiptItems: 'id, receiptId, productId, normalizedName',
  products: 'id, normalizedName, canonicalName',
  productAliases: 'id, productId, &normalizedAlias',
  receiptAdjustments: 'id, receiptId',
  images: 'id, receiptId',
  settings: 'key',
  counters: 'year',
};

/** v2: las líneas guardan la fecha de compra para filtrar por periodo con índices. */
export const SCHEMA_V2 = {
  ...SCHEMA_V1,
  receiptItems: 'id, receiptId, productId, normalizedName, purchaseDate, [productId+purchaseDate]',
  receipts: 'id, &reference, purchaseDate, createdAt, contentHash, perceptualHash, merchantName',
};

export const CURRENT_SCHEMA_VERSION = 2;
