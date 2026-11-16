import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Package, SearchX } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PeriodSelector } from '@/components/forms/PeriodSelector';
import { Card, EmptyState, ListSkeleton, Money, SearchField } from '@/components/common/ui';
import { usePeriodRange, useProducts, useReceiptItems } from '@/hooks/useData';
import { groupByProduct, sortProductStats, type ProductSort } from '@/services/statisticsService';
import { getDb } from '@/database/db';
import { formatDate } from '@/utils/dates';
import { formatQuantityWithUnit } from '@/utils/money';
import { searchKey } from '@/utils/normalize';

const SORTS: { value: ProductSort; label: string }[] = [
  { value: 'spent', label: 'Mayor gasto' },
  { value: 'units', label: 'Más unidades' },
  { value: 'recent', label: 'Más reciente' },
  { value: 'name', label: 'Nombre' },
];

function readSession<T>(key: string, fallback: T): T {
  try {
    const v = sessionStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeSession(key: string, v: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignorar */
  }
}

export function ProductsPage() {
  const navigate = useNavigate();
  const items = useReceiptItems();
  const products = useProducts();
  const aliases = useLiveQuery(() => getDb().productAliases.toArray(), []);
  const range = usePeriodRange();
  const [query, setQueryState] = useState(() => readSession('ticketscan.products.q', ''));
  const [sort, setSortState] = useState<ProductSort>(() => readSession('ticketscan.products.sort', 'spent'));
  const setQuery = (q: string) => {
    setQueryState(q);
    writeSession('ticketscan.products.q', q);
  };
  const setSort = (s: ProductSort) => {
    setSortState(s);
    writeSession('ticketscan.products.sort', s);
  };

  const stats = useMemo(() => {
    if (!items || !products) return null;
    const q = searchKey(query);
    const aliasHits = new Set<string>();
    if (q) for (const a of aliases ?? []) if (searchKey(a.alias).includes(q)) aliasHits.add(a.productId);
    const grouped = groupByProduct(items, products, range).filter((s) => !q || searchKey(s.name).includes(q) || aliasHits.has(s.productId));
    return sortProductStats(grouped, sort);
  }, [items, products, aliases, range, query, sort]);

  const total = stats?.reduce((s, p) => s + p.totalCents, 0) ?? 0;

  return (
    <div className="animate-fade-in pb-6">
      <PageHeader title="Productos" />
      <div className="sticky top-[calc(56px+env(safe-area-inset-top))] z-20 -mx-4 space-y-3 bg-surface/90 px-4 pb-3 pt-1 backdrop-blur-md">
        <SearchField value={query} onChange={setQuery} placeholder="Buscar producto" />
        <div className="flex items-center gap-2">
          <PeriodSelector className="min-w-0 flex-1 justify-start" />
          <label className="relative">
            <span className="sr-only">Ordenar por</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as ProductSort)}
              className="h-10 appearance-none rounded-full bg-white pl-4 pr-8 text-[14px] font-semibold text-ink shadow-card outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-ink-mute" />
          </label>
        </div>
      </div>

      {!stats ? (
        <ListSkeleton />
      ) : (products?.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title="Aún no hay productos"
            message="Los productos aparecerán aquí agrupados automáticamente cuando guardes tickets."
          />
        </Card>
      ) : stats.length === 0 ? (
        <EmptyState icon={<SearchX className="h-8 w-8" />} title="Sin resultados" message="No hay productos comprados en este periodo que coincidan." />
      ) : (
        <>
          <div className="mb-2 flex items-baseline justify-between px-1 text-[13px] text-ink-mute">
            <span>{stats.length} productos</span>
            <span>
              Total <Money cents={total} className="font-semibold text-ink" />
            </span>
          </div>
          <Card className="divide-y divide-surface-line overflow-hidden">
            {stats.map((s) => (
              <button
                key={s.productId}
                type="button"
                onClick={() => navigate(`/productos/${s.productId}`)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-sunken"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold">{s.name}</p>
                  <p className="num mt-0.5 text-[13px] text-ink-mute">
                    {formatQuantityWithUnit(s.quantity, s.unit)}
                    {s.mixedUnits && ' + otras'}
                    {s.avgUnitPriceCents !== null && (
                      <>
                        {' · '}media <Money cents={s.avgUnitPriceCents} />/{s.unit}
                      </>
                    )}
                  </p>
                  <p className="text-[12px] text-ink-faint">
                    {s.receiptCount} {s.receiptCount === 1 ? 'ticket' : 'tickets'} · última {formatDate(s.lastPurchaseDate)}
                  </p>
                </div>
                <Money cents={s.totalCents} className="text-[16px] font-semibold" />
                <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
              </button>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
