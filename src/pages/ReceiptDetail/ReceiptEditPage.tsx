import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/common/ui';
import { ReceiptEditor } from '@/pages/ReceiptReview/ReceiptEditor';
import { Thumbnail } from '@/components/common/Thumbnail';
import { useToast } from '@/app/providers';
import { getReceiptDetails, receiptToDraft, updateReceipt } from '@/services/receiptService';
import type { ReceiptDraft } from '@/types/drafts';

export function ReceiptEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  // Se lee una sola vez para que el formulario no se reinicie mientras se edita
  const [initial, setInitial] = useState<{ draft: ReceiptDraft; reference: string; thumb: string | null } | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    getReceiptDetails(id)
      .then((d) => {
        if (cancelled) return;
        setInitial(
          d ? { draft: receiptToDraft(d.receipt, d.items, d.adjustments), reference: d.receipt.reference, thumb: d.receipt.thumbnailImageId } : null,
        );
      })
      .catch(() => !cancelled && setInitial(null));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const save = async (draft: ReceiptDraft) => {
    setSaving(true);
    try {
      await updateReceipt(id, draft);
      toast('Cambios guardados');
      navigate(`/tickets/${id}`, { replace: true });
    } catch (err) {
      toast((err as Error).message, 'error');
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto min-h-[100dvh] max-w-xl px-4 pl-safe pr-safe">
      <PageHeader title="Editar ticket" subtitle={initial?.reference} back large={false} />
      {initial === undefined && <Skeleton className="mt-4 h-96" />}
      {initial === null && <p className="mt-8 text-center text-ink-mute">Ticket no encontrado.</p>}
      {initial && (
        <ReceiptEditor
          initial={initial.draft}
          submitting={saving}
          submitLabel="Guardar cambios"
          onSubmit={save}
          photo={
            initial.thumb ? (
              <div className="card flex items-center gap-3 p-3">
                <Thumbnail imageId={initial.thumb} className="h-16 w-12" />
                <p className="text-[13px] text-ink-mute">La referencia interna y las fotografías se conservan al editar.</p>
              </div>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
