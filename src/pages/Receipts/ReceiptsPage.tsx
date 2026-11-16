import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Camera, PenLine, ReceiptText, SearchX } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PeriodSelector } from '@/components/forms/PeriodSelector';
import { ReceiptCard } from '@/components/cards/ReceiptCard';
import { Button, Card, EmptyState, IconButton, ListSkeleton, Money, SearchField } from '@/components/common/ui';
import { usePeriodRange, useReceiptItems, useReceipts } from '@/hooks/useData';
import { effectiveTotal } from '@/services/receiptService';
import { isInRange } from '@/utils/dates';
import { searchKey } from '@/utils/normalize';

function useSessionState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (nv: T) => {
    setV(nv);
    try {
      sessionStorage.setItem(key, JSON.stringify(nv));
    } catch {
      /* ignorar */
    }
  };
  return [v, set];
}

export function ReceiptsPage() {
  const navigate = useNavigate();
  const receipts = useReceipts();
  const items = useReceiptItems();
  const range = usePeriodRange();
  const [query, setQuery] = useSessionState('ticketscan.receipts.q', '');
  const [order, setOrder] = useSessionState<'desc' | 'asc'>('ticketscan.receipts.order', 'desc');

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items ?? []) m.set(it.receiptId, (m.get(it.receiptId) ?? 0) + 1);
    return m;
  }, [items]);

  const filtered = useMemo(() => {
    if (!receipts) return null;
    const q = searchKey(query);
    return receipts
      .filter((r) => isInRange(r.purchaseDate, range))
      .filter(
        (r) =>
          !q ||
          searchKey(r.merchantName).includes(q) ||
          r.reference.toLowerCase().includes(q) ||
          searchKey(r.merchantReference).includes(q),
      )
      .sort((a, b) => {
        const c = a.purchaseDate.localeCompare(b.purchaseDate) || a.purchaseTime.localeCompare(b.purchaseTime) || a.createdAt.localeCompare(b.createdAt);
        return order === 'desc' ? -c : c;
      });
  }, [receipts, query, range, order]);

  const total = filtered?.reduce((s, r) => s + effectiveTotal(r), 0) ?? 0;

  return (
    <div className="animate-fade-in pb-6">
      <PageHeader
        title="Tickets"
        actions={
          <IconButton label="Añadir ticket manualmente" onClick={() => navigate('/nuevo')}>
            <PenLine className="h-5 w-5" />
          </IconButton>
        }
      />
      <div className="sticky top-[calc(56px+env(safe-area-inset-top))] z-20 -mx-4 space-y-3 bg-surface/90 px-4 pb-3 pt-1 backdrop-blur-md">
        <SearchField value={query} onChange={setQuery} placeholder="Buscar establecimiento o referencia" />
        <div className="flex items-center gap-2">
          <PeriodSelector className="min-w-0 flex-1 justify-start" />
          <IconButton
            label={order === 'desc' ? 'Orden: más recientes primero' : 'Orden: más antiguos primero'}
            variant="solid"
            onClick={() => setOrder(order === 'desc' ? 'asc' : 'desc')}
          >
            {order === 'desc' ? <ArrowDownWideNarrow className="h-5 w-5" /> : <ArrowUpWideNarrow className="h-5 w-5" />}
          </IconButton>
        </div>
      </div>

      {!filtered ? (
        <ListSkeleton />
      ) : receipts!.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ReceiptText className="h-8 w-8" />}
            title="Todavía no tienes tickets registrados"
            message="Fotografía tu primer ticket para empezar a controlar tus compras."
            action={
              <Button size="lg" icon={<Camera className="h-5 w-5" />} onClick={() => navigate('/escanear')}>
                Fotografiar ticket
              </Button>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX className="h-8 w-8" />}
          title="Sin resultados"
          message="No hay tickets que coincidan con la búsqueda en este periodo."
        />
      ) : (
        <>
          <div className="mb-2 flex items-baseline justify-between px-1 text-[13px] text-ink-mute">
            <span>
              {filtered.length} {filtered.length === 1 ? 'ticket' : 'tickets'}
            </span>
            <span>
              Total <Money cents={total} className="font-semibold text-ink" />
            </span>
          </div>
          <div className="space-y-2.5">
            {filtered.map((r) => (
              <ReceiptCard key={r.id} receipt={r} itemCount={counts.get(r.id) ?? 0} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
