import { getDb, type TicketScanDB } from '@/database/db';
import type { Product, ProductAlias } from '@/types/models';
import { newId, nowIso } from '@/utils/id';
import { normalizeProductName, prettifyProductName } from '@/utils/normalize';

/**
 * Gestión de productos agrupados: resolución por nombre/alias, renombrar,
 * fusionar, separar, asignar líneas y alias. Todas las operaciones mantienen
 * intactos el nombre original (rawName) y la línea OCR de cada línea de ticket.
 */

export class ProductConflictError extends Error {
  constructor(
    message: string,
    public readonly conflictingProductId: string,
  ) {
    super(message);
    this.name = 'ProductConflictError';
  }
}

async function findByNormalized(db: TicketScanDB, normalized: string): Promise<Product | undefined> {
  const alias = await db.productAliases.where('normalizedAlias').equals(normalized).first();
  if (alias) {
    const p = await db.products.get(alias.productId);
    if (p) return p;
  }
  return db.products.where('normalizedName').equals(normalized).first();
}

async function addAliasIfMissing(db: TicketScanDB, productId: string, alias: string): Promise<void> {
  const normalizedAlias = normalizeProductName(alias);
  if (!normalizedAlias) return;
  const existing = await db.productAliases.where('normalizedAlias').equals(normalizedAlias).first();
  if (existing) return;
  await db.productAliases.add({ id: newId(), productId, alias: alias.trim(), normalizedAlias });
}

/**
 * Devuelve el producto al que pertenece un nombre, creándolo si no existe.
 * Debe llamarse dentro de una transacción que incluya products y productAliases.
 */
export async function resolveProductForName(db: TicketScanDB, name: string): Promise<Product> {
  const normalized = normalizeProductName(name);
  const key = normalized || 'producto sin nombre';
  const found = await findByNormalized(db, key);
  if (found) return found;
  const now = nowIso();
  const product: Product = {
    id: newId(),
    canonicalName: prettifyProductName(name) || 'Producto sin nombre',
    normalizedName: key,
    category: '',
    createdAt: now,
    updatedAt: now,
  };
  await db.products.add(product);
  await db.productAliases.add({ id: newId(), productId: product.id, alias: product.canonicalName, normalizedAlias: key });
  return product;
}

/** Producto que se asignaría automáticamente a un nombre (sin crear nada). */
export async function previewProductForName(name: string): Promise<Product | undefined> {
  const normalized = normalizeProductName(name);
  if (!normalized) return undefined;
  return findByNormalized(getDb(), normalized);
}

/** Borra productos que se han quedado sin líneas (y sus alias). */
export async function garbageCollectProducts(db: TicketScanDB, productIds: Iterable<string>): Promise<void> {
  for (const id of new Set(productIds)) {
    const count = await db.receiptItems.where('productId').equals(id).count();
    if (count === 0) {
      await db.productAliases.where('productId').equals(id).delete();
      await db.products.delete(id);
    }
  }
}

export async function createProduct(name: string): Promise<Product> {
  const db = getDb();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('El nombre del producto no puede estar vacío.');
  return db.transaction('rw', db.products, db.productAliases, async () => {
    const normalized = normalizeProductName(trimmed);
    const existing = await findByNormalized(db, normalized);
    if (existing) throw new ProductConflictError(`Ya existe el producto «${existing.canonicalName}».`, existing.id);
    const now = nowIso();
    const product: Product = {
      id: newId(),
      canonicalName: trimmed,
      normalizedName: normalized,
      category: '',
      createdAt: now,
      updatedAt: now,
    };
    await db.products.add(product);
    await db.productAliases.add({ id: newId(), productId: product.id, alias: trimmed, normalizedAlias: normalized });
    return product;
  });
}

export async function renameProduct(productId: string, newName: string): Promise<void> {
  const db = getDb();
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('El nombre del producto no puede estar vacío.');
  await db.transaction('rw', db.products, db.productAliases, async () => {
    const product = await db.products.get(productId);
    if (!product) throw new Error('El producto no existe.');
    const normalized = normalizeProductName(trimmed);
    const other = await findByNormalized(db, normalized);
    if (other && other.id !== productId) {
      throw new ProductConflictError(
        `Ya existe otro producto llamado «${other.canonicalName}». Puedes fusionarlos.`,
        other.id,
      );
    }
    await db.products.update(productId, { canonicalName: trimmed, normalizedName: normalized, updatedAt: nowIso() });
    await addAliasIfMissing(db, productId, trimmed);
  });
}

export async function updateProductCategory(productId: string, category: string): Promise<void> {
  await getDb().products.update(productId, { category: category.trim(), updatedAt: nowIso() });
}

/** Fusiona `sourceId` dentro de `targetId`: mueve líneas y alias y elimina el origen. */
export async function mergeProducts(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) return;
  const db = getDb();
  await db.transaction('rw', db.products, db.productAliases, db.receiptItems, async () => {
    const [source, target] = await Promise.all([db.products.get(sourceId), db.products.get(targetId)]);
    if (!source || !target) throw new Error('No se encuentra alguno de los productos.');
    await db.receiptItems.where('productId').equals(sourceId).modify({ productId: targetId });
    await db.productAliases.where('productId').equals(sourceId).modify({ productId: targetId });
    await addAliasIfMissing(db, targetId, source.canonicalName);
    await db.products.delete(sourceId);
    await db.products.update(targetId, { updatedAt: nowIso() });
  });
}

/**
 * Separa líneas de un producto. Las líneas pasan a `target` (producto existente)
 * o a un producto nuevo con `newName`. Si todas las líneas con un mismo nombre
 * normalizado se mueven, el alias de ese nombre también se mueve, para que los
 * próximos tickets se agrupen igual.
 */
export async function splitProduct(
  productId: string,
  itemIds: string[],
  target: { newName: string } | { productId: string },
): Promise<string> {
  const db = getDb();
  if (itemIds.length === 0) throw new Error('Selecciona al menos una línea.');
  return db.transaction('rw', db.products, db.productAliases, db.receiptItems, async () => {
    let targetId: string;
    if ('productId' in target) {
      targetId = target.productId;
      if (!(await db.products.get(targetId))) throw new Error('El producto de destino no existe.');
    } else {
      const name = target.newName.trim();
      if (!name) throw new Error('Indica un nombre para el nuevo producto.');
      const normalized = normalizeProductName(name);
      const existing = await findByNormalized(db, normalized);
      if (existing && existing.id !== productId) {
        targetId = existing.id;
      } else {
        const now = nowIso();
        targetId = newId();
        await db.products.add({
          id: targetId,
          canonicalName: name,
          normalizedName: normalized,
          category: '',
          createdAt: now,
          updatedAt: now,
        });
        if (!existing) {
          await db.productAliases.add({ id: newId(), productId: targetId, alias: name, normalizedAlias: normalized });
        }
      }
    }
    const moved = await db.receiptItems.where('id').anyOf(itemIds).toArray();
    const movedNames = new Set(moved.filter((m) => m.productId === productId).map((m) => m.normalizedName));
    await db.receiptItems
      .where('id')
      .anyOf(itemIds)
      .modify({ productId: targetId, productAssignment: 'manual' });
    const remaining = await db.receiptItems.where('productId').equals(productId).toArray();
    const remainingNames = new Set(remaining.map((r) => r.normalizedName));
    for (const n of movedNames) {
      if (remainingNames.has(n)) continue;
      const alias = await db.productAliases.where('normalizedAlias').equals(n).first();
      if (alias && alias.productId === productId) await db.productAliases.update(alias.id, { productId: targetId });
    }
    await garbageCollectProducts(db, [productId]);
    return targetId;
  });
}

/** Asigna manualmente una línea de ticket a un producto existente. */
export async function assignItemToProduct(itemId: string, productId: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.products, db.productAliases, db.receiptItems, async () => {
    const item = await db.receiptItems.get(itemId);
    if (!item) throw new Error('La línea no existe.');
    if (!(await db.products.get(productId))) throw new Error('El producto no existe.');
    const previous = item.productId;
    await db.receiptItems.update(itemId, { productId, productAssignment: 'manual' });
    await garbageCollectProducts(db, [previous]);
  });
}

export async function addAlias(productId: string, alias: string): Promise<void> {
  const db = getDb();
  const trimmed = alias.trim();
  if (!trimmed) throw new Error('El alias no puede estar vacío.');
  await db.transaction('rw', db.products, db.productAliases, async () => {
    const normalizedAlias = normalizeProductName(trimmed);
    const existing = await db.productAliases.where('normalizedAlias').equals(normalizedAlias).first();
    if (existing) {
      if (existing.productId === productId) return;
      const other = await db.products.get(existing.productId);
      throw new ProductConflictError(
        `Ese nombre ya pertenece al producto «${other?.canonicalName ?? '?'}».`,
        existing.productId,
      );
    }
    await db.productAliases.add({ id: newId(), productId, alias: trimmed, normalizedAlias });
  });
}

export async function removeAlias(aliasId: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.products, db.productAliases, async () => {
    const alias = await db.productAliases.get(aliasId);
    if (!alias) return;
    const product = await db.products.get(alias.productId);
    if (product && product.normalizedName === alias.normalizedAlias) {
      throw new Error('No se puede eliminar el nombre principal del producto.');
    }
    await db.productAliases.delete(aliasId);
  });
}

export async function listAliases(productId: string): Promise<ProductAlias[]> {
  return getDb().productAliases.where('productId').equals(productId).toArray();
}
