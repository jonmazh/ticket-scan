import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Calculator, CheckCircle2, ChevronDown, Plus, Trash2 } from 'lucide-react';
import type { DraftAdjustment, DraftItem, ReceiptDraft } from '@/types/drafts';
import type { AdjustmentType } from '@/types/models';
import { ItemEditor } from './ItemEditor';
import { MoneyInput } from '@/components/forms/inputs';
import { Badge, Button, IconButton, Money, Row, cx } from '@/components/common/ui';
import { adjustmentsTotal, itemsTotal } from '@/services/receiptService';
import { lineTotalFrom } from '@/utils/money';
import { newId } from '@/utils/id';
import { isValidLocalDate } from '@/utils/dates';

const ADJ_TYPES: { value: AdjustmentType; label: string }[] = [
  { value: 'discount', label: 'Descuento' },
  { value: 'tax', label: 'IVA / impuesto' },
  { value: 'charge', label: 'Cargo' },
  { value: 'refund', label: 'Devolución' },
  { value: 'other', label: 'Otro' },
];

export function emptyItem(): DraftItem {
  return {
    key: newId(),
    rawName: '',
    productName: '',
    quantity: 1,
    unit: 'ud',
    unitPriceCents: 0,
    lineTotalCents: 0,
    originalOcrLine: '',
    extractionConfidence: 1,
    productId: null,
    productAssignment: 'auto',
  };
}

function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12.5px] text-warn-700">{hint}</span>}
    </label>
  );
}

/**
 * Formulario completo de revisión/edición de un ticket. Distingue siempre la
 * suma de las líneas y el total impreso, y nunca ajusta datos automáticamente
 * para que coincidan.
 */
export function ReceiptEditor({
  initial,
  onSubmit,
  submitLabel = 'Guardar ticket',
  submitting,
  photo,
  topNotice,
  reviewFields = [],
}: {
  initial: ReceiptDraft;
  onSubmit: (draft: ReceiptDraft) => void;
  submitLabel?: string;
  submitting?: boolean;
  photo?: ReactNode;
  topNotice?: ReactNode;
  reviewFields?: string[];
}) {
  const [draft, setDraft] = useState<ReceiptDraft>(initial);
  const [showMore, setShowMore] = useState(
    Boolean(initial.merchantAddress || initial.merchantTaxId || initial.subtotalCents !== null),
  );
  const [showOcr, setShowOcr] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const set = (patch: Partial<ReceiptDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const changeItem = useCallback(
    (key: string, patch: Partial<DraftItem>) =>
      setDraft((d) => ({ ...d, items: d.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) })),
    [],
  );
  const removeItem = useCallback(
    (key: string) => setDraft((d) => ({ ...d, items: d.items.filter((it) => it.key !== key) })),
    [],
  );
  const changeAdj = (key: string, patch: Partial<DraftAdjustment>) =>
    setDraft((d) => ({ ...d, adjustments: d.adjustments.map((a) => (a.key === key ? { ...a, ...patch } : a)) }));

  const sumItems = useMemo(() => itemsTotal(draft.items), [draft.items]);
  const sumAdj = useMemo(() => adjustmentsTotal(draft.adjustments), [draft.adjustments]);
  const calculated = sumItems + sumAdj;
  const diff = draft.printedTotalCents === null ? null : draft.printedTotalCents - calculated;
  const taxTotal = draft.adjustments.filter((a) => a.type === 'tax').reduce((s, a) => s + a.amountCents, 0);

  const recalc = () =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((it) => ({ ...it, lineTotalCents: lineTotalFrom(it.quantity, it.unitPriceCents) })),
    }));

  const submit = () => {
    const errs: string[] = [];
    if (!isValidLocalDate(draft.purchaseDate)) errs.push('Indica una fecha de compra válida.');
    draft.items.forEach((it, i) => {
      if (!it.productName.trim()) errs.push(`La línea ${i + 1} no tiene nombre.`);
    });
    if (draft.items.length === 0 && draft.printedTotalCents === null) errs.push('Añade al menos un producto o el total del ticket.');
    setErrors(errs);
    if (errs.length) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    onSubmit(draft);
  };

  const needs = (f: string) => reviewFields.includes(f);

  return (
    <div className="space-y-6 pb-32">
      {topNotice}
      {errors.length > 0 && (
        <div className="rounded-2xl bg-danger-50 p-4 text-[14px] text-danger-600" role="alert">
          <ul className="list-inside list-disc space-y-0.5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {photo}

      {/* Datos generales */}
      <section>
        <h2 className="section-title mb-2">Datos generales</h2>
        <div className="card space-y-4 p-4">
          <Field label="Establecimiento" hint={needs('merchant') ? 'Comprueba el nombre del establecimiento.' : undefined}>
            <input className="field" value={draft.merchantName} onChange={(e) => set({ merchantName: e.target.value })} placeholder="Nombre del comercio" />
          </Field>
          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <Field
              label={
                <span className="flex items-center gap-1.5">
                  Fecha {draft.dateEstimated && <Badge tone="warn">Estimada</Badge>}
                </span>
              }
            >
              <input
                type="date"
                className={cx('field', draft.dateEstimated && 'border-warn-500')}
                value={draft.purchaseDate}
                onChange={(e) => set({ purchaseDate: e.target.value, dateEstimated: false })}
                required
              />
            </Field>
            <Field label="Hora">
              <input type="time" className="field" value={draft.purchaseTime} onChange={(e) => set({ purchaseTime: e.target.value })} />
            </Field>
          </div>
          {draft.dateEstimated && (
            <p className="-mt-2 text-[12.5px] text-warn-700">No se reconoció la fecha: se ha usado la fecha de captura. Corrígela si no es correcta.</p>
          )}
          <Field label="Referencia del establecimiento">
            <input className="field" value={draft.merchantReference} onChange={(e) => set({ merchantReference: e.target.value })} placeholder="Nº de ticket o factura (opcional)" />
          </Field>
          <Field label="Total del ticket (impreso)" hint={needs('total') ? 'No se ha detectado el total con seguridad.' : undefined}>
            <MoneyInput
              value={draft.printedTotalCents}
              onChange={(c) => set({ printedTotalCents: c })}
              allowEmpty
              allowNegative
              className="field text-[18px] font-semibold"
              placeholder="0,00"
            />
          </Field>

          <button type="button" onClick={() => setShowMore((v) => !v)} className="flex items-center gap-1 text-[14px] font-semibold text-brand-600">
            <ChevronDown className={cx('h-4 w-4 transition', showMore && 'rotate-180')} /> {showMore ? 'Menos datos' : 'Más datos (dirección, NIF, subtotal)'}
          </button>
          {showMore && (
            <div className="space-y-4">
              <Field label="Dirección">
                <input className="field" value={draft.merchantAddress} onChange={(e) => set({ merchantAddress: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="CIF / NIF">
                  <input className="field" value={draft.merchantTaxId} onChange={(e) => set({ merchantTaxId: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Subtotal">
                  <MoneyInput value={draft.subtotalCents} onChange={(c) => set({ subtotalCents: c })} allowEmpty className="field" />
                </Field>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Productos */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title">
            Productos <span className="num text-ink-faint">({draft.items.length})</span>
          </h2>
          <Button variant="ghost" size="sm" icon={<Calculator className="h-4 w-4" />} onClick={recalc} disabled={draft.items.length === 0}>
            Recalcular
          </Button>
        </div>
        {needs('items') && draft.items.length > 0 && (
          <p className="mb-2 rounded-xl bg-warn-50 px-3 py-2 text-[13px] text-warn-700">Revisa las líneas marcadas: el reconocimiento no es perfecto.</p>
        )}
        <div className="space-y-2.5">
          {draft.items.map((it, i) => (
            <ItemEditor key={it.key} item={it} index={i} onChange={changeItem} onRemove={removeItem} />
          ))}
          {draft.items.length === 0 && (
            <p className="card p-5 text-center text-[15px] text-ink-mute">No hay productos. Añádelos manualmente.</p>
          )}
        </div>
        <Button
          variant="secondary"
          block
          className="mt-3"
          icon={<Plus className="h-5 w-5" />}
          onClick={() => setDraft((d) => ({ ...d, items: [...d.items, emptyItem()] }))}
        >
          Añadir línea
        </Button>
      </section>

      {/* Descuentos, IVA y otros ajustes */}
      <section>
        <h2 className="section-title mb-2">Descuentos, IVA y ajustes</h2>
        <div className="space-y-2.5">
          {draft.adjustments.map((a) => (
            <div key={a.key} className="card p-3">
              <div className="flex items-center gap-2">
                <select
                  className="field-sm w-[44%]"
                  value={a.type}
                  aria-label="Tipo de ajuste"
                  onChange={(e) => {
                    const type = e.target.value as AdjustmentType;
                    const negative = type === 'discount' || type === 'refund';
                    changeAdj(a.key, {
                      type,
                      affectsTotal: type !== 'tax',
                      amountCents: negative ? -Math.abs(a.amountCents) : type === 'charge' || type === 'tax' ? Math.abs(a.amountCents) : a.amountCents,
                    });
                  }}
                >
                  {ADJ_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div className="flex-1">
                  <MoneyInput
                    value={a.amountCents}
                    allowNegative
                    onChange={(c) => {
                      let v = c ?? 0;
                      if (a.type === 'discount' || a.type === 'refund') v = -Math.abs(v);
                      changeAdj(a.key, { amountCents: v });
                    }}
                    aria-label="Importe del ajuste"
                  />
                </div>
                <IconButton label="Eliminar ajuste" className="h-10 w-10 text-danger-500" onClick={() => setDraft((d) => ({ ...d, adjustments: d.adjustments.filter((x) => x.key !== a.key) }))}>
                  <Trash2 className="h-[18px] w-[18px]" />
                </IconButton>
              </div>
              <input
                className="field-sm mt-2"
                value={a.description}
                placeholder="Descripción"
                aria-label="Descripción del ajuste"
                onChange={(e) => changeAdj(a.key, { description: e.target.value })}
              />
              {a.type === 'tax' && <p className="mt-1.5 text-[12px] text-ink-faint">Informativo: el IVA ya está incluido en los precios.</p>}
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          block
          className="mt-2"
          icon={<Plus className="h-5 w-5" />}
          onClick={() =>
            setDraft((d) => ({
              ...d,
              adjustments: [...d.adjustments, { key: newId(), description: 'Descuento', type: 'discount', amountCents: 0, affectsTotal: true }],
            }))
          }
        >
          Añadir descuento o ajuste
        </Button>
      </section>

      {/* Comprobación de importes */}
      <section>
        <h2 className="section-title mb-2">Comprobación de importes</h2>
        <div className="card divide-y divide-surface-line px-4">
          <Row label="Suma de productos">
            <Money cents={sumItems} />
          </Row>
          {sumAdj !== 0 && (
            <Row label="Descuentos y ajustes">
              <Money cents={sumAdj} />
            </Row>
          )}
          <Row label="Total calculado">
            <Money cents={calculated} className="font-semibold" />
          </Row>
          <Row label="Total impreso en el ticket">{draft.printedTotalCents === null ? <span className="text-ink-faint">Sin indicar</span> : <Money cents={draft.printedTotalCents} className="font-semibold" />}</Row>
          {taxTotal !== 0 && (
            <Row label="IVA incluido">
              <Money cents={taxTotal} />
            </Row>
          )}
        </div>
        {diff !== null && diff !== 0 ? (
          <div className="mt-3 flex gap-3 rounded-2xl bg-warn-50 p-4 text-warn-700" role="status">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-[14px] leading-snug">
              <p className="font-semibold">El importe de los productos no coincide con el total del ticket.</p>
              <p className="mt-0.5">
                Diferencia: <Money cents={diff} className="font-semibold" />. Puedes corregir las líneas o guardar igualmente; la diferencia quedará visible.
              </p>
            </div>
          </div>
        ) : diff === 0 && draft.items.length > 0 ? (
          <p className="mt-3 flex items-center gap-2 text-[14px] font-medium text-brand-700">
            <CheckCircle2 className="h-5 w-5" /> Los importes cuadran con el total del ticket.
          </p>
        ) : null}
      </section>

      {/* Observaciones */}
      <section>
        <h2 className="section-title mb-2">Observaciones</h2>
        <textarea
          className="field min-h-[88px] resize-y"
          value={draft.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Notas sobre esta compra (opcional)"
        />
      </section>

      {draft.ocrText && (
        <section>
          <button type="button" onClick={() => setShowOcr((v) => !v)} className="flex items-center gap-1 text-[14px] font-semibold text-ink-mute">
            <ChevronDown className={cx('h-4 w-4 transition', showOcr && 'rotate-180')} /> Texto reconocido (OCR)
          </button>
          {showOcr && (
            <pre className="card mt-2 max-h-80 overflow-auto whitespace-pre-wrap p-3 font-mono text-[12px] leading-relaxed text-ink-soft">{draft.ocrText}</pre>
          )}
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-line bg-white/95 pb-safe backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-ink-mute">Total</p>
            <p className="text-[18px] font-bold">
              <Money cents={draft.printedTotalCents ?? calculated} />
            </p>
          </div>
          <Button size="lg" onClick={submit} loading={submitting} className="min-w-[170px]">
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
