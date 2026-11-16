import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { IconButton } from '@/components/common/ui';
import { ReceiptEditor, emptyItem } from './ReceiptEditor';
import { DuplicateSheet } from '@/features/camera/DuplicateSheet';
import { emptyDraft } from '@/features/receipt-parser/toDraft';
import { useConfirm, useSettings, useToast } from '@/app/providers';
import { createReceipt, findPossibleDuplicates, type DuplicateMatch } from '@/services/receiptService';
import type { ReceiptDraft } from '@/types/drafts';

/** Alta manual de un ticket (sin cámara ni OCR). */
export function ManualReceiptPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [dups, setDups] = useState<{ matches: DuplicateMatch[]; draft: ReceiptDraft } | null>(null);
  const [initial] = useState<ReceiptDraft>(() => ({ ...emptyDraft(settings.currency), items: [emptyItem()] }));

  const save = async (d: ReceiptDraft, force = false) => {
    setSaving(true);
    try {
      if (!force && d.printedTotalCents !== null) {
        const matches = await findPossibleDuplicates({ merchantName: d.merchantName, purchaseDate: d.purchaseDate, totalCents: d.printedTotalCents });
        if (matches.length) {
          setDups({ matches, draft: d });
          setSaving(false);
          return;
        }
      }
      const r = await createReceipt(d, null);
      toast(`Ticket ${r.reference} guardado`);
      navigate(`/tickets/${r.id}`, { replace: true });
    } catch (err) {
      toast((err as Error).message, 'error');
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto min-h-[100dvh] max-w-xl px-4 pl-safe pr-safe">
      <PageHeader
        title="Nuevo ticket"
        subtitle="Introducción manual"
        large={false}
        actions={
          <IconButton
            label="Cancelar"
            onClick={async () => {
              if (await confirm({ title: '¿Descartar este ticket?', confirmLabel: 'Descartar', destructive: true })) navigate(-1);
            }}
          >
            <X className="h-6 w-6" />
          </IconButton>
        }
      />
      <ReceiptEditor initial={initial} submitting={saving} onSubmit={(d) => save(d)} />
      {dups && (
        <DuplicateSheet
          matches={dups.matches}
          saving={saving}
          onCancel={() => setDups(null)}
          onView={(id) => navigate(`/tickets/${id}`)}
          onSaveAnyway={() => {
            const d = dups.draft;
            setDups(null);
            void save(d, true);
          }}
        />
      )}
    </div>
  );
}
