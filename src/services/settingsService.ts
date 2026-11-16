import { getMainDb } from '@/database/db';
import type { AppSettings } from '@/types/models';

/** Ajustes de la aplicación. Se guardan siempre en la base de datos principal. */

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'es',
  currency: 'EUR',
  dateFormat: 'dd/MM/yyyy',
  photoQuality: 'original',
  ocrLanguages: ['spa'],
  ocrPageSegMode: '4',
  defaultEnhancement: 'contrast',
  lastBackupAt: null,
};

const KEY = 'app';

export async function getSettings(): Promise<AppSettings> {
  const rec = await getMainDb().settings.get(KEY);
  return { ...DEFAULT_SETTINGS, ...((rec?.value as Partial<AppSettings>) ?? {}) };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const db = getMainDb();
  return db.transaction('rw', db.settings, async () => {
    const current = await getSettings();
    const next = { ...current, ...patch };
    await db.settings.put({ key: KEY, value: next });
    return next;
  });
}
