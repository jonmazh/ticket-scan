import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Camera, ChevronRight, PenLine, ReceiptText } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PeriodSelector } from '@/components/forms/PeriodSelector';
import { MonthlyBarChart, type MonthBar } from '@/components/charts/MonthlyBarChart';
import { ReceiptCard } from '@/components/cards/ReceiptCard';
import { Button, Card, EmptyState, Money, Skeleton, cx } from '@/components/common/ui';
import { usePeriod } from '@/app/providers';
import { usePeriodRange, useProducts, useReceiptItems, useReceipts } from '@/hooks/useData';
import { compare, groupByProduct, monthlyTotals, summarize, topProducts } from '@/services/statisticsService';
import { anchorMonth, lastMonths, previousMonth, resolvePeriod, singleMonthOf, formatMonthYear } from '@/utils/dates';
import { formatPercent, formatQuantityWithUnit, formatQuantity } from '@/utils/money';

export function DashboardPage() {
  const navigate = useNavigate();
  const { period, setPeriod } = usePeriod();
  const range = usePeriodRange();
  const receipts = useReceipts();
  const items = useReceiptItems();
  const products = useProducts();
  const loading = !receipts || !items || !products;

  const data = useMemo(() => {
    if (!receipts || !items || !products) return null;
    const summary = summarize(receipts, items, range);
    const single = singleMonthOf(period);
    let comparison = null as ReturnType<typeof compare> | null;
    let prevLabel = '';
    if (single) {
      const prev = previousMonth(single.year, single.month);
      const prevSummary = summarize(receipts, items, resolvePeriod({ kind: 'month', ...prev }));
      if (prevSummary.receiptCount > 0) {
        comparison = compare(summary.totalCents, prevSummary.totalCents);
        prevLabel = formatMonthYear(prev.year, prev.month);
      }
    }
    const anchor = anchorMonth(range);
    const months = lastMonths(anchor.year, anchor.month, 6);
    const totals = monthlyTotals(receipts, months.map((m) => m.key));
    const bars: MonthBar[] = months.map((m) => ({ ...m, totalCents: totals.get(m.key) ?? 0 }));
    const top = topProducts(groupByProduct(items, products, range), 5);
    const latest = receipts
      .filter((r) => (!range.from || r.purchaseDate >= range.from) && (!range.to || r.purchaseDate <= range.to))
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it.receiptId, (counts.get(it.receiptId) ?? 0) + 1);
    return { summary, comparison, prevLabel, bars, top, latest, counts, single };
  }, [receipts, items, products, range, period]);

  const hasAny = (receipts?.length ?? 0) > 0;

  return (
    <div className="animate-fade-in pb-6">
      <PageHeader title="Resumen" />
      <div className="mb-4 mt-1">
        <PeriodSelector />
      </div>

      {/* A. Gasto del periodo */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-fab" aria-label="Gasto del periodo">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" aria-hidden />
        <p className="text-[14px] font-medium text-white/80">{data?.single ? 'Gasto del mes' : 'Gasto del periodo'}</p>
        {loading || !data ? (
          <Skeleton className="mt-2 h-10 w-40 bg-white/20" />
        ) : (
          <p className="num mt-1 text-[40px] font-bold leading-tight tracking-tight">
            <Money cents={data.summary.totalCents} />
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-white/85">
          <span>
            <strong className="num font-semibold text-white">{data?.summary.receiptCount ?? '—'}</strong> tickets
          </span>
          <span>
            <strong className="num font-semibold text-white">{data ? formatQuantity(data.summary.units) : '—'}</strong> unidades
          </span>
        </div>
        {data?.comparison && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[13px] font-semibold">
            {data.comparison.diffCents > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            {data.comparison.percent !== null ? formatPercent(Math.abs(data.comparison.percent), 0) : ''}{' '}
            {data.comparison.diffCents > 0 ? 'más' : 'menos'} que {data.prevLabel.toLowerCase()}
          </div>
        )}
      </section>

      {/* E. Acceso rápido */}
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <Button size="lg" icon={<Camera className="h-5 w-5" />} onClick={() => navigate('/escanear')}>
          Escanear ticket
        </Button>
        <Button size="lg" variant="secondary" icon={<PenLine className="h-5 w-5" />} onClick={() => navigate('/nuevo')} aria-label="Añadir ticket manualmente">
          <span className="hidden min-[400px]:inline">Manual</span>
        </Button>
      </div>

      {!loading && !hasAny ? (
        <Card className="mt-6">
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
      ) : (
        <>
          {/* B. Evolución mensual */}
          <section className="mt-6">
            <h2 className="section-title mb-2">Evolución mensual</h2>
            <Card className="p-4">
              {data ? (
                <MonthlyBarChart
                  data={data.bars}
                  selectedKey={data.single ? `${data.single.year}-${String(data.single.month).padStart(2, '0')}` : null}
                  onSelect={(b) => setPeriod({ kind: 'month', year: b.year, month: b.month })}
                />
              ) : (
                <Skeleton className="h-44" />
              )}
              <p className="mt-2 text-center text-[12px] text-ink-faint">Pulsa un mes para ver sus datos</p>
            </Card>
          </section>

          {/* C. Productos con mayor gasto */}
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="section-title">Productos con mayor gasto</h2>
              <button type="button" onClick={() => navigate('/productos')} className="text-[14px] font-semibold text-brand-600">
                Ver todos
              </button>
            </div>
            <Card className="divide-y divide-surface-line">
              {!data ? (
                <div className="space-y-3 p-4">
                  <Skeleton className="h-5" />
                  <Skeleton className="h-5" />
                </div>
              ) : data.top.length === 0 ? (
                <p className="p-5 text-center text-[15px] text-ink-mute">No hay compras en este periodo.</p>
              ) : (
                data.top.map((p, i) => (
                  <button
                    key={p.productId}
                    type="button"
                    onClick={() => navigate(`/productos/${p.productId}`)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-sunken"
                  >
                    <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[13px] font-bold text-ink-soft">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[15px] font-semibold">{p.name}</span>
                        <Money cents={p.totalCents} className="text-[15px] font-semibold" />
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, p.percent)}%` }} />
                        </div>
                        <span className="num w-12 text-right text-[12px] text-ink-mute">{formatPercent(p.percent, 0)}</span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-ink-faint">{formatQuantityWithUnit(p.quantity, p.unit)}</div>
                    </div>
                  </button>
                ))
              )}
            </Card>
          </section>

          {/* D. Últimos tickets */}
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="section-title">Últimos tickets</h2>
              <button type="button" onClick={() => navigate('/tickets')} className="flex items-center text-[14px] font-semibold text-brand-600">
                Ver todos <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className={cx('space-y-2.5')}>
              {data?.latest.length === 0 && (
                <Card className="p-5 text-center text-[15px] text-ink-mute">No hay tickets en este periodo.</Card>
              )}
              {data?.latest.map((r) => <ReceiptCard key={r.id} receipt={r} itemCount={data.counts.get(r.id) ?? 0} />)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
