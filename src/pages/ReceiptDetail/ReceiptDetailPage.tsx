import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Camera, CheckCircle2, Crop, ImagePlus, Maximize2, Pencil, ReceiptText, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, EmptyState, IconButton, Money, Row, Skeleton, cx } from '@/components/common/ui';
import { ImageViewer } from '@/components/common/ImageViewer';
import { ImageAdjuster } from '@/features/camera/ImageAdjuster';
import { useConfirm, useSettings, useToast } from '@/app/providers';
import { getDb } from '@/database/db';
import { useStoredImageUrl } from '@/hooks/useImage';
import {
  deleteReceipt,
  getReceiptDetails,
  replaceReceiptImages,
  setProcessedImage,
  totalDifference,
  effectiveTotal,
} from '@/services/receiptService';
import { buildReceiptImages, canvasToVariant, loadImage } from '@/services/imageService';
import { formatDate, formatDateTime } from '@/utils/dates';
import { formatQuantityWithUnit } from '@/utils/money';

const ADJ_LABEL = { discount: 'Descuento', tax: 'IVA', charge: 'Cargo', refund: 'Devolución', other: 'Ajuste' } as const;

export function ReceiptDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { toast } = useToast();
  const { settings } = useSettings();
  const details = useLiveQuery(() => getReceiptDetails(id), [id]);
  const products = useLiveQuery(() => getDb().products.toArray(), []);
  const [showProcessed, setShowProcessed] = useState(false);
  const [viewer, setViewer] = useState(false);
  const [adjusting, setAdjusting] = useState<HTMLImageElement | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  const receipt = details?.receipt;
  const imageId = showProcessed && receipt?.processedImageId ? receipt.processedImageId : receipt?.originalImageId ?? null;
  const { url: photoUrl, loading: photoLoading } = useStoredImageUrl(imageId);

  if (details === undefined) {
    return (
      <div className="pt-safe">
        <Skeleton className="mt-16 h-64" />
        <Skeleton className="mt-4 h-40" />
      </div>
    );
  }
  if (details === null || !receipt) {
    return (
      <>
        <PageHeader title="Ticket" back="/tickets" />
        <EmptyState icon={<ReceiptText className="h-8 w-8" />} title="Ticket no encontrado" message="Puede que se haya eliminado." />
      </>
    );
  }

  const { items, adjustments } = details;
  const productName = (pid: string) => products?.find((p) => p.id === pid)?.canonicalName;
  const diff = totalDifference(receipt);
  const sumAdj = adjustments.filter((a) => a.affectsTotal).reduce((s, a) => s + a.amountCents, 0);

  const remove = async () => {
    const ok = await confirm({
      title: `¿Eliminar ${receipt.reference}?`,
      message: 'Se borrarán el ticket, sus líneas de producto y sus fotografías. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar ticket',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteReceipt(receipt.id);
      toast('Ticket eliminado');
      navigate('/tickets', { replace: true });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const startAdjust = async () => {
    if (!receipt.originalImageId) return;
    const img = await getDb().images.get(receipt.originalImageId);
    if (!img) return;
    try {
      setAdjusting(await loadImage(img.blob));
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const onReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const ok = await confirm({
      title: receipt.originalImageId ? '¿Sustituir la fotografía?' : '¿Añadir esta fotografía?',
      message: receipt.originalImageId ? 'La fotografía original actual se eliminará y se guardará la nueva. Los datos del ticket no cambian.' : undefined,
      confirmLabel: receipt.originalImageId ? 'Sustituir' : 'Añadir',
      destructive: Boolean(receipt.originalImageId),
    });
    if (!ok) return;
    try {
      await replaceReceiptImages(receipt.id, await buildReceiptImages(f, null, settings.photoQuality));
      setShowProcessed(false);
      toast('Fotografía guardada');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  if (adjusting) {
    return (
      <ImageAdjuster
        image={adjusting}
        defaultEnhancement={settings.defaultEnhancement}
        onBack={() => setAdjusting(null)}
        onConfirm={async ({ canvas }) => {
          try {
            await setProcessedImage(receipt.id, await canvasToVariant(canvas, 0.9));
            setShowProcessed(true);
            toast('Imagen ajustada guardada. La original se conserva.');
          } catch (err) {
            toast((err as Error).message, 'error');
          }
          setAdjusting(null);
        }}
      />
    );
  }

  return (
    <div className="animate-fade-in pb-8">
      <input ref={replaceInput} type="file" accept="image/*" className="hidden" onChange={onReplace} />
      <PageHeader
        title={receipt.reference}
        subtitle={receipt.merchantName || 'Sin establecimiento'}
        back="/tickets"
        actions={
          <IconButton label="Editar ticket" onClick={() => navigate(`/tickets/${receipt.id}/editar`)}>
            <Pencil className="h-5 w-5" />
          </IconButton>
        }
      />

      {/* Fotografía */}
      <Card className="overflow-hidden">
        {receipt.originalImageId ? (
          <>
            <button type="button" onClick={() => photoUrl && setViewer(true)} className="relative block w-full bg-surface-sunken" aria-label="Ampliar fotografía">
              {photoUrl ? (
                <img src={photoUrl} alt={`Fotografía del ticket ${receipt.reference}`} className="mx-auto max-h-[360px] w-full object-contain" />
              ) : (
                <Skeleton className={cx('h-64 rounded-none', !photoLoading && 'animate-none')} />
              )}
              <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-semibold text-white">
                <Maximize2 className="h-3.5 w-3.5" /> Ampliar
              </span>
            </button>
            <div className="flex flex-wrap items-center gap-2 p-3">
              {receipt.processedImageId && (
                <div className="flex rounded-lg bg-surface-sunken p-0.5 text-[13px] font-semibold">
                  <button type="button" onClick={() => setShowProcessed(false)} className={cx('rounded-md px-2.5 py-1.5', !showProcessed ? 'bg-white shadow-sm' : 'text-ink-mute')}>
                    Original
                  </button>
                  <button type="button" onClick={() => setShowProcessed(true)} className={cx('rounded-md px-2.5 py-1.5', showProcessed ? 'bg-white shadow-sm' : 'text-ink-mute')}>
                    Ajustada
                  </button>
                </div>
              )}
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" icon={<Crop className="h-4 w-4" />} onClick={startAdjust}>
                  Ajustar
                </Button>
                <Button size="sm" variant="ghost" icon={<Camera className="h-4 w-4" />} onClick={() => replaceInput.current?.click()}>
                  Sustituir
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken text-ink-faint">
              <ReceiptText className="h-6 w-6" />
            </div>
            <p className="flex-1 text-[15px] text-ink-mute">Este ticket no tiene fotografía.</p>
            <Button size="sm" variant="secondary" icon={<ImagePlus className="h-4 w-4" />} onClick={() => replaceInput.current?.click()}>
              Añadir
            </Button>
          </div>
        )}
      </Card>

      {/* Datos generales */}
      <section className="mt-5">
        <h2 className="section-title mb-2">Datos del ticket</h2>
        <Card className="divide-y divide-surface-line px-4">
          <Row label="Referencia interna">
            <span className="num">{receipt.reference}</span>
          </Row>
          <Row label="Ref. establecimiento">{receipt.merchantReference || <span className="text-ink-faint">—</span>}</Row>
          <Row label="Establecimiento">{receipt.merchantName || <span className="text-ink-faint">—</span>}</Row>
          {receipt.merchantAddress && <Row label="Dirección">{receipt.merchantAddress}</Row>}
          {receipt.merchantTaxId && <Row label="CIF/NIF">{receipt.merchantTaxId}</Row>}
          <Row label="Fecha">
            <span className="inline-flex items-center gap-1.5">
              {formatDate(receipt.purchaseDate, settings.dateFormat)}
              {receipt.dateEstimated && <Badge tone="warn">Estimada</Badge>}
            </span>
          </Row>
          <Row label="Hora">{receipt.purchaseTime || <span className="text-ink-faint">—</span>}</Row>
        </Card>
      </section>

      {/* Productos */}
      <section className="mt-5">
        <h2 className="section-title mb-2">Productos ({items.length})</h2>
        <Card className="divide-y divide-surface-line">
          {items.length === 0 && <p className="p-4 text-center text-[15px] text-ink-mute">Sin líneas de producto.</p>}
          {items.map((it) => (
            <Link key={it.id} to={`/productos/${it.productId}`} className="flex items-start gap-3 px-4 py-3 active:bg-surface-sunken">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{it.productName}</p>
                <p className="num text-[13px] text-ink-mute">
                  {formatQuantityWithUnit(it.quantity, it.unit)} × <Money cents={it.unitPriceCents} />
                </p>
                {productName(it.productId) && productName(it.productId) !== it.productName && (
                  <p className="truncate text-[12px] text-ink-faint">Agrupado en {productName(it.productId)}</p>
                )}
              </div>
              <Money cents={it.lineTotalCents} className="text-[15px] font-semibold" />
            </Link>
          ))}
        </Card>
      </section>

      {/* Ajustes */}
      {adjustments.length > 0 && (
        <section className="mt-5">
          <h2 className="section-title mb-2">Descuentos e impuestos</h2>
          <Card className="divide-y divide-surface-line px-4">
            {adjustments.map((a) => (
              <Row key={a.id} label={`${ADJ_LABEL[a.type]}${a.description && a.description !== ADJ_LABEL[a.type] ? ` · ${a.description}` : ''}`}>
                <Money cents={a.amountCents} className={a.amountCents < 0 ? 'text-brand-700' : ''} />
                {!a.affectsTotal && <span className="ml-1 text-[12px] text-ink-faint">(incluido)</span>}
              </Row>
            ))}
          </Card>
        </section>
      )}

      {/* Importes */}
      <section className="mt-5">
        <h2 className="section-title mb-2">Importes</h2>
        <Card className="divide-y divide-surface-line px-4">
          <Row label="Suma de las líneas">
            <Money cents={receipt.calculatedItemsTotalCents} />
          </Row>
          {sumAdj !== 0 && (
            <Row label="Descuentos y ajustes">
              <Money cents={sumAdj} />
            </Row>
          )}
          <Row label="Total oficial (impreso)">
            {receipt.printedTotalCents === null ? <span className="text-ink-faint">No indicado</span> : <Money cents={receipt.printedTotalCents} className="font-semibold" />}
          </Row>
          <Row label="Importe contabilizado">
            <Money cents={effectiveTotal(receipt)} className="font-bold" />
          </Row>
        </Card>
        {diff !== null && diff !== 0 ? (
          <div className="mt-3 flex gap-3 rounded-2xl bg-warn-50 p-4 text-[14px] text-warn-700">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p>
              El importe de los productos no coincide con el total del ticket. Diferencia: <Money cents={diff} className="font-semibold" />.
            </p>
          </div>
        ) : diff === 0 ? (
          <p className="mt-3 flex items-center gap-2 px-1 text-[14px] text-brand-700">
            <CheckCircle2 className="h-4 w-4" /> Los importes cuadran.
          </p>
        ) : null}
      </section>

      {receipt.notes && (
        <section className="mt-5">
          <h2 className="section-title mb-2">Observaciones</h2>
          <Card className="whitespace-pre-wrap p-4 text-[15px]">{receipt.notes}</Card>
        </section>
      )}

      <p className="mt-5 px-1 text-[12px] text-ink-faint">
        Registrado el {formatDateTime(receipt.createdAt)}
        {receipt.updatedAt !== receipt.createdAt && ` · Modificado el ${formatDateTime(receipt.updatedAt)}`}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" icon={<Pencil className="h-5 w-5" />} onClick={() => navigate(`/tickets/${receipt.id}/editar`)}>
          Editar
        </Button>
        <Button variant="danger" size="lg" icon={<Trash2 className="h-5 w-5" />} onClick={remove}>
          Eliminar
        </Button>
      </div>

      {viewer && photoUrl && <ImageViewer src={photoUrl} alt={`Ticket ${receipt.reference}`} onClose={() => setViewer(false)} />}
    </div>
  );
}
