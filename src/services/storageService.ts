/** Información orientativa del almacenamiento del navegador. */

export interface StorageInfo {
  supported: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
  /** 0..1 */
  ratio: number | null;
  persisted: boolean | null;
  nearlyFull: boolean;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!s?.estimate) {
    return { supported: false, usageBytes: null, quotaBytes: null, ratio: null, persisted: null, nearlyFull: false };
  }
  const est = await s.estimate().catch(() => ({ usage: undefined, quota: undefined }) as StorageEstimate);
  const usage = est.usage ?? null;
  const quota = est.quota ?? null;
  const ratio = usage !== null && quota ? usage / quota : null;
  const persisted = s.persisted ? await s.persisted().catch(() => null) : null;
  const free = usage !== null && quota !== null ? quota - usage : null;
  return {
    supported: true,
    usageBytes: usage,
    quotaBytes: quota,
    ratio,
    persisted,
    nearlyFull: (ratio !== null && ratio > 0.85) || (free !== null && free < 100 * 1024 * 1024),
  };
}

/** Solicita almacenamiento persistente. El navegador puede denegarlo. */
export async function requestPersistentStorage(): Promise<boolean> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!s?.persist) return false;
  try {
    if (await s.persisted?.()) return true;
    return await s.persist();
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1).replace('.', ',')} ${units[i]}`;
}
