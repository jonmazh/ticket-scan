import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { getDb } from '@/database/db';
import { usePeriod } from '@/app/providers';
import { resolvePeriod, type DateRange } from '@/utils/dates';

/** Tickets en vivo (sin imágenes: las imágenes están en otra tabla). */
export function useReceipts() {
  return useLiveQuery(() => getDb().receipts.toArray(), []);
}

export function useReceiptItems() {
  return useLiveQuery(() => getDb().receiptItems.toArray(), []);
}

export function useProducts() {
  return useLiveQuery(() => getDb().products.toArray(), []);
}

export function usePeriodRange(): DateRange {
  const { period } = usePeriod();
  return useMemo(() => resolvePeriod(period), [period]);
}
