import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/database/db';

/** Crea una URL temporal para un Blob y la libera al desmontar. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** URL de una imagen guardada en IndexedDB (o null mientras carga / si no existe). */
export function useStoredImageUrl(imageId: string | null | undefined): { url: string | null; loading: boolean } {
  const record = useLiveQuery(async () => (imageId ? ((await getDb().images.get(imageId)) ?? null) : null), [imageId], undefined);
  const url = useObjectUrl(record?.blob);
  return { url, loading: record === undefined };
}
