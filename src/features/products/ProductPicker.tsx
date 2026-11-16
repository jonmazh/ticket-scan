import { useMemo, useState } from 'react';
import { Check, Plus, Sparkles } from 'lucide-react';
import { Sheet } from '@/components/common/Sheet';
import { Button, SearchField, cx } from '@/components/common/ui';
import { useProducts } from '@/hooks/useData';
import { createProduct, ProductConflictError } from '@/services/productService';
import { searchKey } from '@/utils/normalize';
import { useToast } from '@/app/providers';
import type { Product } from '@/types/models';

/**
 * Selector de producto: permite elegir un producto existente, crear uno nuevo
 * o (opcionalmente) volver a la agrupación automática por nombre.
 */
export function ProductPicker({
  open,
  onClose,
  onPick,
  currentProductId,
  excludeProductId,
  allowAuto,
  title = 'Asignar a producto',
  initialQuery = '',
}: {
  open: boolean;
  onClose: () => void;
  onPick: (product: Product | null) => void;
  currentProductId?: string | null;
  excludeProductId?: string;
  allowAuto?: boolean;
  title?: string;
  initialQuery?: string;
}) {
  const products = useProducts();
  const { toast } = useToast();
  const [query, setQuery] = useState(initialQuery);
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const q = searchKey(query);
    const collator = new Intl.Collator('es');
    return (products ?? [])
      .filter((p) => p.id !== excludeProductId)
      .filter((p) => !q || searchKey(p.canonicalName).includes(q))
      .sort((a, b) => collator.compare(a.canonicalName, b.canonicalName))
      .slice(0, 100);
  }, [products, query, excludeProductId]);

  const exact = list.some((p) => searchKey(p.canonicalName) === searchKey(query));

  const create = async () => {
    setCreating(true);
    try {
      const p = await createProduct(query);
      onPick(p);
      onClose();
    } catch (err) {
      if (err instanceof ProductConflictError) {
        const existing = products?.find((p) => p.id === err.conflictingProductId);
        if (existing) {
          onPick(existing);
          onClose();
          return;
        }
      }
      toast((err as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title} size="full">
      <div className="sticky top-0 z-10 -mx-5 bg-surface px-5 pb-3">
        <SearchField value={query} onChange={setQuery} placeholder="Buscar o escribir un nombre nuevo" autoFocus />
      </div>
      {allowAuto && (
        <button
          type="button"
          onClick={() => {
            onPick(null);
            onClose();
          }}
          className="card mb-3 flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <Sparkles className="h-5 w-5 text-brand-600" />
          <div className="flex-1">
            <div className="text-[15px] font-semibold">Agrupar automáticamente</div>
            <div className="text-[13px] text-ink-mute">Según el nombre de la línea</div>
          </div>
          {!currentProductId && <Check className="h-5 w-5 text-brand-600" />}
        </button>
      )}
      {query.trim() && !exact && (
        <Button variant="secondary" block className="mb-3" icon={<Plus className="h-5 w-5" />} loading={creating} onClick={create}>
          Crear producto «{query.trim()}»
        </Button>
      )}
      <ul className="card divide-y divide-surface-line overflow-hidden">
        {list.length === 0 && <li className="p-4 text-center text-[15px] text-ink-mute">No hay productos que coincidan.</li>}
        {list.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => {
                onPick(p);
                onClose();
              }}
              className={cx('flex min-h-[50px] w-full items-center justify-between gap-2 px-4 py-2 text-left active:bg-surface-sunken')}
            >
              <span className="text-[15px]">{p.canonicalName}</span>
              {currentProductId === p.id && <Check className="h-5 w-5 shrink-0 text-brand-600" />}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
