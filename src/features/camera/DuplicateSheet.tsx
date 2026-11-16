import { AlertTriangle } from 'lucide-react';
import { Sheet } from '@/components/common/Sheet';
import { Button, Money } from '@/components/common/ui';
import type { DuplicateMatch } from '@/services/receiptService';
import { effectiveTotal } from '@/services/receiptService';
import { formatDate } from '@/utils/dates';

const REASON: Record<DuplicateMatch['reason'], string> = {
  'same-image': 'Misma fotografía',
  'similar-image': 'Fotografía muy parecida',
  'same-data': 'Mismo establecimiento, fecha e importe',
};

/** Aviso de posible ticket duplicado. Nunca borra nada: el usuario decide. */
export function DuplicateSheet({
  matches,
  onCancel,
  onView,
  onSaveAnyway,
  saving,
}: {
  matches: DuplicateMatch[];
  onCancel: () => void;
  onView: (id: string) => void;
  onSaveAnyway: () => void;
  saving?: boolean;
}) {
  return (
    <Sheet open onClose={onCancel} title="Este ticket podría estar ya registrado">
      <div className="mb-4 flex gap-3 rounded-2xl bg-warn-50 p-3 text-[14px] text-warn-700">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <p>Hemos encontrado {matches.length === 1 ? 'un ticket parecido' : `${matches.length} tickets parecidos`}. Comprueba que no lo estás guardando dos veces.</p>
      </div>
      <ul className="space-y-2">
        {matches.map((m) => (
          <li key={m.receipt.id} className="card flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{m.receipt.merchantName || 'Sin establecimiento'}</p>
              <p className="text-[13px] text-ink-mute">
                {formatDate(m.receipt.purchaseDate)} · {m.receipt.reference} · <Money cents={effectiveTotal(m.receipt)} />
              </p>
              <p className="text-[12px] font-medium text-warn-700">{REASON[m.reason]}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => onView(m.receipt.id)}>
              Revisar
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-col gap-2 pb-2">
        <Button size="lg" variant="dark" block onClick={onSaveAnyway} loading={saving}>
          Guardar igualmente
        </Button>
        <Button size="lg" variant="ghost" block onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </Sheet>
  );
}
