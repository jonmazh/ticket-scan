import { beforeEach, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import { createReceipt } from '@/services/receiptService';
import {
  BackupValidationError,
  exportBackup,
  exportLinesCsv,
  exportReceiptsCsv,
  exportProductsCsv,
  parseBackupFile,
  restoreBackup,
} from '@/services/backupService';
import type { TicketScanDB } from '@/database/db';
import { draft, draftItem, fakeImages, freshDb } from './helpers';

async function blobText(b: Blob): Promise<string> {
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await b.arrayBuffer());
}

describe('copias de seguridad', () => {
  let db: TicketScanDB;
  beforeEach(async () => {
    db = await freshDb();
  });

  it('exporta un ZIP con JSON e imágenes y lo restaura sustituyendo', async () => {
    const r = await createReceipt(draft('2026-11-01', [draftItem('Leche', 120), draftItem('Pan', 150)]), fakeImages('x'));
    await createReceipt(draft('2026-11-02', [draftItem('Leche', 120)]), null);
    const zip = await exportBackup();
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files)).toContain('backup.json');
    const manifest = JSON.parse(strFromU8(files['backup.json']));
    expect(manifest.data.receipts).toHaveLength(2);
    expect(manifest.data.images).toHaveLength(3);
    expect(Object.keys(files).filter((f) => f.startsWith('images/'))).toHaveLength(3);

    const parsed = await parseBackupFile(zip);
    expect(parsed.summary).toMatchObject({ receipts: 2, products: 2, images: 3 });

    // Base de datos nueva y vacía -> restaurar
    db = await freshDb();
    await restoreBackup(parsed, 'replace');
    expect(await db.receipts.count()).toBe(2);
    expect(await db.receiptItems.count()).toBe(3);
    const restored = await db.receipts.get(r.id);
    expect(restored!.reference).toBe(r.reference);
    const original = await db.images.get(restored!.originalImageId!);
    expect(await blobText(original!.blob)).toBe('original-x');
  });

  it('importa sin duplicar y renumera referencias en conflicto', async () => {
    await createReceipt(draft('2026-11-01', [draftItem('Leche', 120)]), fakeImages('a'));
    const backup = await parseBackupFile(await exportBackup());

    // Otro dispositivo con un ticket propio que ocupa la misma referencia
    db = await freshDb();
    const own = await createReceipt(draft('2026-11-05', [draftItem('Leche entera', 99)]), fakeImages('own'));
    expect(own.reference).toBe(backup.manifest.data.receipts[0].reference);
    const res = await restoreBackup(backup, 'merge');
    expect(res).toMatchObject({ receiptsAdded: 1, receiptsSkipped: 0, referencesChanged: 1 });
    const refs = (await db.receipts.toArray()).map((r) => r.reference).sort();
    expect(new Set(refs).size).toBe(2);

    // Importar otra vez la misma copia no duplica nada
    const again = await restoreBackup(backup, 'merge');
    expect(again.receiptsAdded).toBe(0);
    expect(again.receiptsSkipped).toBe(1);
    expect(await db.receipts.count()).toBe(2);
  });

  it('rechaza archivos no válidos', async () => {
    await expect(parseBackupFile(new Blob(['hola']))).rejects.toBeInstanceOf(BackupValidationError);
    const noJson = new Blob([zipSync({ 'otro.txt': strToU8('x') }) as BlobPart]);
    await expect(parseBackupFile(noJson)).rejects.toThrow(/backup\.json/);
    const bad = new Blob([
      zipSync({
        'backup.json': strToU8(
          JSON.stringify({
            format: 'ticketscan-backup',
            formatVersion: 1,
            data: { receipts: [{ id: 'a', reference: 'X', purchaseDate: 'nope' }], receiptItems: [], products: [], productAliases: [], receiptAdjustments: [], counters: [], images: [] },
          }),
        ),
      }) as BlobPart,
    ]);
    await expect(parseBackupFile(bad)).rejects.toBeInstanceOf(BackupValidationError);
  });

  it('exporta CSV compatibles con Excel en español', async () => {
    await createReceipt(draft('2026-11-01', [draftItem('Leche; "fresca"', 120), draftItem('Manzanas', 300, 1.25, 'kg')]), null);
    const tickets = await blobText(await exportReceiptsCsv());
    expect(tickets.charCodeAt(0)).toBe(0xfeff);
    expect(tickets).toContain('Referencia;Fecha;');
    expect(tickets).toContain('01/11/2026');
    expect(tickets).toContain('4,20');
    const lines = await blobText(await exportLinesCsv());
    expect(lines).toContain('"Leche; ""fresca"""');
    expect(lines).toContain('1,25;kg;2,40;3,00');
    const products = await blobText(await exportProductsCsv());
    expect(products).toContain('Manzanas;;1,25;kg;3,00;2,40;1;01/11/2026');
  });
});
