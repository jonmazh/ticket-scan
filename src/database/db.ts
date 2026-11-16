import Dexie, { type Table } from 'dexie';
import type {
  Product,
  ProductAlias,
  Receipt,
  ReceiptAdjustment,
  ReceiptItem,
  ReferenceCounter,
  SettingRecord,
  StoredImage,
} from '@/types/models';
import { DB_NAME, DEMO_DB_NAME, SCHEMA_V1, SCHEMA_V2 } from './schema';
import { migrateToV2 } from './migrations';

export class TicketScanDB extends Dexie {
  receipts!: Table<Receipt, string>;
  receiptItems!: Table<ReceiptItem, string>;
  products!: Table<Product, string>;
  productAliases!: Table<ProductAlias, string>;
  receiptAdjustments!: Table<ReceiptAdjustment, string>;
  images!: Table<StoredImage, string>;
  settings!: Table<SettingRecord, string>;
  counters!: Table<ReferenceCounter, number>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores(SCHEMA_V1);
    this.version(2).stores(SCHEMA_V2).upgrade(migrateToV2);
  }

  /** Todas las tablas de datos (para transacciones completas). */
  get dataTables() {
    return [
      this.receipts,
      this.receiptItems,
      this.products,
      this.productAliases,
      this.receiptAdjustments,
      this.images,
      this.counters,
    ];
  }
}

/**
 * Base de datos principal (datos reales) y base de datos de demostración
 * separada. Los datos de demostración NUNCA se mezclan con el histórico real.
 */
let mainDb: TicketScanDB | null = null;
let demoDb: TicketScanDB | null = null;
let active: 'main' | 'demo' = 'main';
let override: TicketScanDB | null = null;

export function getMainDb(): TicketScanDB {
  if (override) return override;
  if (!mainDb) mainDb = new TicketScanDB(DB_NAME);
  return mainDb;
}

export function getDemoDb(): TicketScanDB {
  if (!demoDb) demoDb = new TicketScanDB(DEMO_DB_NAME);
  return demoDb;
}

/** Base de datos activa (real o demostración). */
export function getDb(): TicketScanDB {
  if (override) return override;
  return active === 'demo' ? getDemoDb() : getMainDb();
}

export function setActiveDatabase(mode: 'main' | 'demo'): void {
  active = mode;
}

export function getActiveDatabaseMode(): 'main' | 'demo' {
  return active;
}

export async function deleteDemoDatabase(): Promise<void> {
  if (demoDb) {
    demoDb.close();
    demoDb = null;
  }
  await Dexie.delete(DEMO_DB_NAME);
}

/** Solo para pruebas: fuerza una base de datos concreta. */
export function __setTestDb(db: TicketScanDB | null): void {
  override = db;
}
