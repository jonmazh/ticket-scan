import { useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronRight } from 'lucide-react';
import type { Receipt } from '@/types/models';
import { Thumbnail } from '@/components/common/Thumbnail';
import { Money } from '@/components/common/ui';
import { formatDate } from '@/utils/dates';
import { effectiveTotal, totalDifference } from '@/services/receiptService';
import { useSettings } from '@/app/providers';

export function ReceiptCard({ receipt, itemCount }: { receipt: Receipt; itemCount?: number }) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const diff = totalDifference(receipt);
  return (
    <button
      type="button"
      onClick={() => navigate(`/tickets/${receipt.id}`)}
      className="card pressable flex w-full items-center gap-3 p-3 text-left"
    >
      <Thumbnail imageId={receipt.thumbnailImageId} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-semibold text-ink">{receipt.merchantName || 'Establecimiento sin nombre'}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-mute">
          <span>{formatDate(receipt.purchaseDate, settings.dateFormat)}</span>
          <span aria-hidden>·</span>
          <span className="num">{receipt.reference}</span>
        </div>
        {itemCount !== undefined && (
          <div className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-faint">
            {itemCount} {itemCount === 1 ? 'producto' : 'productos'}
            {diff !== null && diff !== 0 && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-warn-700">
                <AlertCircle className="h-3.5 w-3.5" /> Diferencia
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Money cents={effectiveTotal(receipt)} className="text-[16px] font-semibold" />
        <ChevronRight className="h-5 w-5 text-ink-faint" aria-hidden />
      </div>
    </button>
  );
}
