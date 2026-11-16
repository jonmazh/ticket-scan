import { memo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Layers, Trash2 } from 'lucide-react';
import type { DraftItem } from '@/types/drafts';
import type { QuantityUnit } from '@/types/models';
import { MoneyInput, QuantityInput } from '@/components/forms/inputs';
import { IconButton, cx } from '@/components/common/ui';
import { ProductPicker } from '@/features/products/ProductPicker';
import { getDb } from '@/database/db';
import { previewProductForName } from '@/services/productService';
import { lineTotalFrom, unitPriceFrom } from '@/utils/money';

const UNITS: { value: QuantityUnit; label: string }[] = [
  { value: 'ud', label: 'ud' },
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'l', label: 'l' },
  { value: 'ml', label: 'ml' },
];

function GroupingHint({ item, onOpenPicker }: { item: DraftItem; onOpenPicker: () => void }) {
  const preview = useLiveQuery(async () => {
    if (item.productId && item.productAssignment === 'manual') {
      const p = await getDb().products.get(item.productId);
      return { name: p?.canonicalName ?? '—', manual: true, isNew: false };
    }
    const p = await previewProductForName(item.productName);
    return { name: p?.canonicalName ?? '', manual: false, isNew: !p };
  }, [item.productId, item.productAssignment, item.productName]);
  if (!preview || !item.productName.trim()) return null;
  return (
    <button
      type="button"
      onClick={onOpenPicker}
      className="mt-2 flex w-full items-center gap-1.5 rounded-lg bg-surface-sunken px-2.5 py-1.5 text-left text-[12.5px] text-ink-mute"
    >
      <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {preview.isNew ? (
          <>Producto nuevo</>
        ) : (
          <>
            {preview.manual ? 'Asignado a' : 'Se agrupará en'} <strong className="font-semibold text-ink-soft">{preview.name}</strong>
          </>
        )}
      </span>
      <span className="shrink-0 font-semibold text-brand-600">Cambiar</span>
    </button>
  );
}

export const ItemEditor = memo(function ItemEditor({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: DraftItem;
  index: number;
  onChange: (key: string, patch: Partial<DraftItem>) => void;
  onRemove: (key: string) => void;
}) {
  const [picker, setPicker] = useState(false);
  const lowConfidence = item.extractionConfidence < 0.6;
  const mismatch = Math.abs(lineTotalFrom(item.quantity, item.unitPriceCents) - item.lineTotalCents) > 1;
  const set = (patch: Partial<DraftItem>) => onChange(item.key, patch);

  return (
    <div className={cx('card p-3', lowConfidence && 'ring-1 ring-warn-500/50')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor={`name-${item.key}`}>
            Nombre del producto {index + 1}
          </label>
          <input
            id={`name-${item.key}`}
            className="field-sm font-semibold"
            value={item.productName}
            placeholder="Nombre del producto"
            onChange={(e) => set({ productName: e.target.value })}
          />
        </div>
        <IconButton label={`Eliminar línea ${index + 1}`} onClick={() => onRemove(item.key)} className="-mr-1 h-10 w-10 text-danger-500">
          <Trash2 className="h-[18px] w-[18px]" />
        </IconButton>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_0.9fr_1.15fr_1.25fr] gap-1.5">
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-medium text-ink-faint">Cant.</span>
          <QuantityInput
            value={item.quantity}
            onChange={(q) => set({ quantity: q, lineTotalCents: lineTotalFrom(q, item.unitPriceCents) })}
            aria-label="Cantidad"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-medium text-ink-faint">Unidad</span>
          <select
            className="field-sm px-1.5"
            value={item.unit}
            onChange={(e) => set({ unit: e.target.value as QuantityUnit })}
            aria-label="Unidad"
          >
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-medium text-ink-faint">Precio/{item.unit}</span>
          <MoneyInput
            value={item.unitPriceCents}
            onChange={(c) => set({ unitPriceCents: c ?? 0, lineTotalCents: lineTotalFrom(item.quantity, c ?? 0) })}
            aria-label="Precio unitario"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-medium text-ink-faint">Importe</span>
          <MoneyInput
            value={item.lineTotalCents}
            onChange={(c) => set({ lineTotalCents: c ?? 0, unitPriceCents: unitPriceFrom(c ?? 0, item.quantity) })}
            aria-label="Importe de la línea"
            className="field-sm font-semibold"
          />
        </label>
      </div>

      {(lowConfidence || mismatch) && (
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-warn-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {lowConfidence ? 'Lectura dudosa: comprueba esta línea.' : 'Cantidad × precio no coincide con el importe.'}
        </p>
      )}
      {item.originalOcrLine && (
        <p className="mt-1.5 truncate font-mono text-[11.5px] text-ink-faint" title={item.originalOcrLine}>
          OCR: {item.originalOcrLine}
        </p>
      )}
      <GroupingHint item={item} onOpenPicker={() => setPicker(true)} />
      {picker && (
        <ProductPicker
          open
          onClose={() => setPicker(false)}
          allowAuto
          currentProductId={item.productAssignment === 'manual' ? item.productId : null}
          initialQuery=""
          onPick={(p) =>
            set(p ? { productId: p.id, productAssignment: 'manual' } : { productId: null, productAssignment: 'auto' })
          }
        />
      )}
    </div>
  );
});
