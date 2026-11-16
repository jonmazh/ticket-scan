import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRightLeft, Combine, MoreHorizontal, Package, Pencil, Scissors, Tag, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PeriodSelector } from '@/components/forms/PeriodSelector';
import { Badge, Button, Card, EmptyState, IconButton, Money, Row, Skeleton, cx } from '@/components/common/ui';
import { Sheet } from '@/components/common/Sheet';
import { ProductPicker } from '@/features/products/ProductPicker';
import { useConfirm, useToast } from '@/app/providers';
import { getDb } from '@/database/db';
import { usePeriodRange } from '@/hooks/useData';
import {
  addAlias,
  assignItemToProduct,
  mergeProducts,
  ProductConflictError,
  removeAlias,
  renameProduct,
  splitProduct,
  updateProductCategory,
} from '@/services/productService';
import { groupByProduct } from '@/services/statisticsService';
import { formatDate, isInRange } from '@/utils/dates';
import { formatQuantityWithUnit } from '@/utils/money';
import type { Product } from '@/types/models';

type Dialog = null | 'menu' | 'rename' | 'merge' | 'aliases' | 'split-target' | 'move-line';

export function ProductDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();
  const range = usePeriodRange();
  const data = useLiveQuery(async () => {
    const db = getDb();
    const product = await db.products.get(id);
    if (!product) return null;
    const [items, aliases] = await Promise.all([
      db.receiptItems.where('productId').equals(id).toArray(),
      db.productAliases.where('productId').equals(id).toArray(),
    ]);
    const receipts = await db.receipts.bulkGet([...new Set(items.map((i) => i.receiptId))]);
    return { product, items, aliases, receipts: new Map(receipts.filter(Boolean).map((r) => [r!.id, r!])) };
  }, [id]);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [aliasText, setAliasText] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [splitName, setSplitName] = useState('');
  const [moveLineId, setMoveLineId] = useState<string | null>(null);
  const [scope, setScope] = useState<'period' | 'all'>('period');

  const view = useMemo(() => {
    if (!data) return null;
    const effectiveRange = scope === 'all' ? { from: null, to: null } : range;
    const stat = groupByProduct(data.items, [data.product], effectiveRange)[0] ?? null;
    const rows = data.items
      .filter((i) => isInRange(i.purchaseDate, effectiveRange))
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
    return { stat, rows };
  }, [data, range, scope]);

  if (data === undefined) return <Skeleton className="mt-20 h-64" />;
  if (data === null) {
    return (
      <>
        <PageHeader title="Producto" back="/productos" />
        <EmptyState icon={<Package className="h-8 w-8" />} title="Producto no encontrado" message="Puede que se haya fusionado con otro o eliminado." />
      </>
    );
  }
  const { product, aliases, receipts } = data;

  const handleConflict = async (err: unknown) => {
    if (err instanceof ProductConflictError) {
      const ok = await confirm({
        title: 'Ya existe ese producto',
        message: `${err.message} ¿Quieres fusionar «${product.canonicalName}» con él? Se sumarán sus compras.`,
        confirmLabel: 'Fusionar',
      });
      if (ok) {
        await mergeProducts(product.id, err.conflictingProductId);
        toast('Productos fusionados');
        navigate(`/productos/${err.conflictingProductId}`, { replace: true });
      }
      return;
    }
    toast((err as Error).message, 'error');
  };

  const doRename = async () => {
    try {
      if (name.trim() && name.trim() !== product.canonicalName) await renameProduct(product.id, name);
      if (category.trim() !== product.category) await updateProductCategory(product.id, category);
      setDialog(null);
      toast('Producto actualizado');
    } catch (err) {
      setDialog(null);
      await handleConflict(err);
    }
  };

  const doMerge = async (target: Product | null) => {
    if (!target) return;
    const ok = await confirm({
      title: 'Fusionar productos',
      message: (
        <>
          Todas las compras de «{product.canonicalName}» pasarán a «{target.canonicalName}». El nombre actual se guardará como alias. Los nombres originales de cada ticket se conservan.
        </>
      ),
      confirmLabel: 'Fusionar',
    });
    if (!ok) return;
    try {
      await mergeProducts(product.id, target.id);
      toast('Productos fusionados');
      navigate(`/productos/${target.id}`, { replace: true });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const doSplit = async (target: { newName: string } | { productId: string }) => {
    try {
      const newId = await splitProduct(product.id, [...selected], target);
      setSelected(new Set());
      setSelecting(false);
      setDialog(null);
      toast('Líneas separadas');
      if (!data.items.some((i) => !selected.has(i.id))) navigate(`/productos/${newId}`, { replace: true });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const toggle = (itemId: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(itemId)) n.delete(itemId);
      else n.add(itemId);
      return n;
    });

  const stat = view?.stat;

  return (
    <div className="animate-fade-in pb-28">
      <PageHeader
        title={product.canonicalName}
        subtitle={product.category || undefined}
        back="/productos"
        actions={
          <IconButton label="Opciones del producto" onClick={() => setDialog('menu')}>
            <MoreHorizontal className="h-6 w-6" />
          </IconButton>
        }
      />

      <div className="mb-4 mt-1 flex items-center gap-2">
        {scope === 'period' ? <PeriodSelector className="min-w-0 flex-1 justify-start" /> : <div className="flex-1 text-[15px] font-semibold">Todo el histórico</div>}
        <Button size="sm" variant="secondary" onClick={() => setScope(scope === 'all' ? 'period' : 'all')}>
          {scope === 'all' ? 'Ver periodo' : 'Ver todo'}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Card className="p-4">
          <p className="text-[13px] text-ink-mute">Gasto</p>
          <p className="mt-0.5 text-[22px] font-bold">
            <Money cents={stat?.totalCents ?? 0} />
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-ink-mute">Cantidad</p>
          <p className="num mt-0.5 text-[22px] font-bold">{stat ? formatQuantityWithUnit(stat.quantity, stat.unit) : '0'}</p>
          {stat?.mixedUnits && <p className="text-[12px] text-ink-faint">Hay otras unidades</p>}
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-ink-mute">Precio medio</p>
          <p className="mt-0.5 text-[18px] font-semibold">
            {stat?.avgUnitPriceCents != null ? (
              <>
                <Money cents={stat.avgUnitPriceCents} />
                <span className="text-[13px] font-normal text-ink-mute">/{stat.unit}</span>
              </>
            ) : (
              <span className="text-ink-faint">—</span>
            )}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-ink-mute">Tickets</p>
          <p className="num mt-0.5 text-[18px] font-semibold">{stat?.receiptCount ?? 0}</p>
          <p className="text-[12px] text-ink-faint">{stat?.lastPurchaseDate ? `Última: ${formatDate(stat.lastPurchaseDate)}` : 'Sin compras'}</p>
        </Card>
      </div>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title">Histórico de compras</h2>
          {view && view.rows.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelecting((v) => !v);
                setSelected(new Set());
              }}
              className="text-[14px] font-semibold text-brand-600"
            >
              {selecting ? 'Cancelar' : 'Separar líneas'}
            </button>
          )}
        </div>
        {selecting && <p className="mb-2 px-1 text-[13px] text-ink-mute">Selecciona las compras que no pertenecen a este producto.</p>}
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-surface-line bg-surface-sunken/60 px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-ink-mute">
            <span>Fecha · Ticket</span>
            <span className="text-right">Cant. × precio</span>
            <span className="w-[72px] text-right">Total</span>
          </div>
          {view?.rows.length === 0 && <p className="p-4 text-center text-[15px] text-ink-mute">Sin compras en este periodo.</p>}
          <ul className="divide-y divide-surface-line">
            {view?.rows.map((it) => {
              const r = receipts.get(it.receiptId);
              return (
                <li key={it.id} className={cx('flex items-center gap-2 px-4 py-3', selected.has(it.id) && 'bg-brand-50')}>
                  {selecting && (
                    <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} className="h-5 w-5 accent-brand-600" aria-label={`Seleccionar compra del ${formatDate(it.purchaseDate)}`} />
                  )}
                  <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_auto] items-center gap-x-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium">{formatDate(it.purchaseDate)}</p>
                      <Link to={`/tickets/${it.receiptId}`} className="num text-[13px] font-semibold text-brand-600">
                        {r?.reference ?? 'Ticket'}
                      </Link>
                      {it.productName !== product.canonicalName && <p className="truncate text-[12px] text-ink-faint">«{it.productName}»</p>}
                    </div>
                    <span className="num text-right text-[13px] text-ink-mute">
                      {formatQuantityWithUnit(it.quantity, it.unit)}
                      <br />× <Money cents={it.unitPriceCents} />
                    </span>
                    <Money cents={it.lineTotalCents} className="w-[72px] text-right text-[15px] font-semibold" />
                  </div>
                  {!selecting && (
                    <IconButton
                      label="Mover esta compra a otro producto"
                      className="-mr-2 h-9 w-9"
                      onClick={() => {
                        setMoveLineId(it.id);
                        setDialog('move-line');
                      }}
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                    </IconButton>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      {aliases.length > 1 && (
        <section className="mt-6">
          <h2 className="section-title mb-2">Nombres alternativos</h2>
          <div className="flex flex-wrap gap-1.5">
            {aliases
              .filter((a) => a.normalizedAlias !== product.normalizedName)
              .map((a) => (
                <Badge key={a.id}>{a.alias}</Badge>
              ))}
          </div>
        </section>
      )}

      {selecting && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-nav-offset z-30 px-4">
          <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-ink p-3 pl-4 text-white shadow-float">
            <span className="flex-1 text-[14px]">{selected.size} seleccionadas</span>
            <Button
              variant="primary"
              icon={<Scissors className="h-4 w-4" />}
              onClick={() => {
                setSplitName('');
                setDialog('split-target');
              }}
            >
              Separar
            </Button>
          </div>
        </div>
      )}

      {/* Menú */}
      <Sheet open={dialog === 'menu'} onClose={() => setDialog(null)} title="Producto">
        <div className="card divide-y divide-surface-line overflow-hidden">
          {[
            { icon: Pencil, label: 'Renombrar / categoría', action: () => { setName(product.canonicalName); setCategory(product.category); setDialog('rename'); } },
            { icon: Combine, label: 'Fusionar con otro producto', action: () => setDialog('merge') },
            { icon: Scissors, label: 'Separar compras mal agrupadas', action: () => { setDialog(null); setSelecting(true); } },
            { icon: Tag, label: 'Nombres alternativos (alias)', action: () => { setAliasText(''); setDialog('aliases'); } },
          ].map((o) => (
            <button key={o.label} type="button" onClick={o.action} className="flex h-14 w-full items-center gap-3 px-4 text-left text-[16px] active:bg-surface-sunken">
              <o.icon className="h-5 w-5 text-brand-600" /> {o.label}
            </button>
          ))}
        </div>
        <p className="mt-3 px-1 text-[13px] text-ink-mute">Los cambios actualizan todas las estadísticas. El nombre original de cada línea del ticket se conserva siempre.</p>
      </Sheet>

      {/* Renombrar */}
      <Sheet
        open={dialog === 'rename'}
        onClose={() => setDialog(null)}
        title="Editar producto"
        footer={
          <Button size="lg" block onClick={doRename} disabled={!name.trim()}>
            Guardar
          </Button>
        }
      >
        <label className="block">
          <span className="label">Nombre</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="mt-4 block">
          <span className="label">Categoría (opcional)</span>
          <input className="field" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Lácteos, limpieza…" />
        </label>
      </Sheet>

      {dialog === 'merge' && (
        <ProductPicker open onClose={() => setDialog(null)} excludeProductId={product.id} title="Fusionar con…" onPick={doMerge} />
      )}

      {dialog === 'move-line' && moveLineId && (
        <ProductPicker
          open
          onClose={() => setDialog(null)}
          excludeProductId={product.id}
          title="Mover compra a…"
          onPick={async (p) => {
            if (!p) return;
            try {
              await assignItemToProduct(moveLineId, p.id);
              toast(`Compra movida a «${p.canonicalName}»`);
              if (data.items.length === 1) navigate(`/productos/${p.id}`, { replace: true });
            } catch (err) {
              toast((err as Error).message, 'error');
            }
          }}
        />
      )}

      {/* Separar: destino */}
      <Sheet open={dialog === 'split-target'} onClose={() => setDialog(null)} title="Separar en…">
        <label className="block">
          <span className="label">Nuevo producto</span>
          <input className="field" value={splitName} onChange={(e) => setSplitName(e.target.value)} placeholder="Nombre del nuevo producto" />
        </label>
        <Button size="lg" block className="mt-3" disabled={!splitName.trim()} onClick={() => doSplit({ newName: splitName })}>
          Crear producto y mover {selected.size} {selected.size === 1 ? 'compra' : 'compras'}
        </Button>
        <div className="my-4 text-center text-[13px] text-ink-faint">o</div>
        <SplitToExisting excludeId={product.id} onPick={(p) => doSplit({ productId: p.id })} />
      </Sheet>

      {/* Alias */}
      <Sheet open={dialog === 'aliases'} onClose={() => setDialog(null)} title="Nombres alternativos">
        <p className="mb-3 text-[14px] text-ink-mute">Las líneas de tickets futuros con cualquiera de estos nombres se agruparán en «{product.canonicalName}».</p>
        <div className="flex gap-2">
          <input className="field flex-1" value={aliasText} onChange={(e) => setAliasText(e.target.value)} placeholder="Ej.: LECHE ENT. 1L" />
          <Button
            size="lg"
            disabled={!aliasText.trim()}
            onClick={async () => {
              try {
                await addAlias(product.id, aliasText);
                setAliasText('');
              } catch (err) {
                toast((err as Error).message, 'error');
              }
            }}
          >
            Añadir
          </Button>
        </div>
        <ul className="card mt-4 divide-y divide-surface-line">
          {aliases.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[15px]">
                {a.alias} {a.normalizedAlias === product.normalizedName && <Badge tone="brand">Principal</Badge>}
              </span>
              {a.normalizedAlias !== product.normalizedName && (
                <IconButton
                  label={`Eliminar alias ${a.alias}`}
                  className="h-9 w-9"
                  onClick={async () => {
                    try {
                      await removeAlias(a.id);
                    } catch (err) {
                      toast((err as Error).message, 'error');
                    }
                  }}
                >
                  <X className="h-4 w-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      </Sheet>

      {/* Resumen de todos los datos */}
      <Card className="mt-6 divide-y divide-surface-line px-4">
        <Row label="Nombre normalizado">
          <span className="font-mono text-[13px]">{product.normalizedName}</span>
        </Row>
        <Row label="Compras en total">{data.items.length}</Row>
      </Card>
    </div>
  );
}

function SplitToExisting({ excludeId, onPick }: { excludeId: string; onPick: (p: Product) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="lg" block onClick={() => setOpen(true)}>
        Elegir un producto existente
      </Button>
      {open && <ProductPicker open onClose={() => setOpen(false)} excludeProductId={excludeId} title="Mover a…" onPick={(p) => p && onPick(p)} />}
    </>
  );
}
