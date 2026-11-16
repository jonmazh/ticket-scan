import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ScanLine, WifiOff, X } from 'lucide-react';
import { CameraCapture } from '@/features/camera/CameraCapture';
import { ImageAdjuster, type AdjustResult } from '@/features/camera/ImageAdjuster';
import { DuplicateSheet } from '@/features/camera/DuplicateSheet';
import { ReceiptEditor } from '@/pages/ReceiptReview/ReceiptEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, IconButton } from '@/components/common/ui';
import { ImageViewer } from '@/components/common/ImageViewer';
import { useConfirm, useOnline, useSettings, useToast } from '@/app/providers';
import { buildReceiptImages, loadImage } from '@/services/imageService';
import { checkOcrOfflineAvailability, recognizeImage, type OcrProgress } from '@/features/ocr/ocrService';
import { parseReceipt } from '@/features/receipt-parser';
import { emptyDraft, parsedToDraft } from '@/features/receipt-parser/toDraft';
import { createReceipt, effectiveTotal, findPossibleDuplicates, type DuplicateMatch } from '@/services/receiptService';
import { requestPersistentStorage } from '@/services/storageService';
import { useObjectUrl } from '@/hooks/useImage';
import type { ReceiptDraft } from '@/types/drafts';

type Step = 'capture' | 'loading' | 'adjust' | 'processing' | 'missing-ocr' | 'review';

/**
 * Flujo completo: fotografiar -> ajustar -> vista previa -> OCR -> revisión -> guardar.
 */
export function ScanPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { toast } = useToast();
  const confirm = useConfirm();
  const online = useOnline();
  const [step, setStep] = useState<Step>('capture');
  const [file, setFile] = useState<Blob | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [processed, setProcessed] = useState<HTMLCanvasElement | null>(null);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [reviewFields, setReviewFields] = useState<string[]>([]);
  const [ocrFailed, setOcrFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<{ matches: DuplicateMatch[]; draft: ReceiptDraft } | null>(null);
  const [viewer, setViewer] = useState(false);
  const captureDate = useRef(new Date());
  const photoUrl = useObjectUrl(file);
  const processedUrl = useProcessedUrl(processed);

  const onCapture = async (blob: Blob) => {
    setStep('loading');
    captureDate.current = new Date();
    try {
      const img = await loadImage(blob);
      setFile(blob);
      setImage(img);
      setStep('adjust');
    } catch (err) {
      toast((err as Error).message, 'error');
      setStep('capture');
    }
  };

  const runOcr = async (result: AdjustResult) => {
    setProcessed(result.canvas);
    setOcrFailed(null);
    if (!navigator.onLine) {
      const avail = await checkOcrOfflineAvailability(settings.ocrLanguages);
      if (!avail.cachedForOffline) {
        setStep('missing-ocr');
        return;
      }
    }
    setStep('processing');
    setProgress({ stage: 'loading', progress: 0, message: 'Preparando…' });
    try {
      const ocr = await recognizeImage(result.canvas, {
        languages: settings.ocrLanguages,
        pageSegMode: settings.ocrPageSegMode,
        onProgress: setProgress,
      });
      const parsed = parseReceipt(ocr.text);
      const d = parsedToDraft(parsed, ocr.text, settings.currency, captureDate.current);
      if (parsed.items.length === 0) {
        setOcrFailed('No hemos podido interpretar correctamente el ticket. Puedes introducir los datos manualmente.');
      }
      setReviewFields(parsed.needsReview);
      setDraft(d);
      setProgress({ stage: 'done', progress: 1, message: 'Análisis completado' });
      setTimeout(() => setStep('review'), 450);
    } catch (err) {
      setOcrFailed(`${(err as Error).message} Puedes introducir los datos manualmente.`);
      setDraft(emptyDraft(settings.currency, captureDate.current, 'ocr-failed'));
      setReviewFields(['merchant', 'date', 'total', 'items']);
      setStep('review');
    }
  };

  const manualWithPhoto = () => {
    setDraft(emptyDraft(settings.currency, captureDate.current, 'ocr-failed'));
    setReviewFields([]);
    setOcrFailed(null);
    setStep('review');
  };

  const save = async (d: ReceiptDraft, force = false) => {
    if (!file) return;
    setSaving(true);
    try {
      const images = await buildReceiptImages(file, processed, settings.photoQuality);
      if (!force) {
        const matches = await findPossibleDuplicates({
          contentHash: images.contentHash,
          perceptualHash: images.perceptualHash,
          merchantName: d.merchantName,
          purchaseDate: d.purchaseDate,
          totalCents: d.printedTotalCents ?? effectiveTotal({
            printedTotalCents: null,
            calculatedItemsTotalCents: d.items.reduce((s, i) => s + i.lineTotalCents, 0),
            adjustmentsTotalCents: d.adjustments.filter((a) => a.affectsTotal).reduce((s, a) => s + a.amountCents, 0),
          }),
        });
        if (matches.length) {
          setDuplicates({ matches, draft: d });
          setSaving(false);
          return;
        }
      }
      const receipt = await createReceipt(d, images);
      void requestPersistentStorage();
      toast(`Ticket ${receipt.reference} guardado`);
      navigate(`/tickets/${receipt.id}`, { replace: true });
    } catch (err) {
      toast((err as Error).message || 'No se ha podido guardar el ticket.', 'error');
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (step === 'review' || step === 'adjust') {
      const ok = await confirm({
        title: '¿Descartar este ticket?',
        message: 'Se perderán la fotografía y los datos que no hayas guardado.',
        confirmLabel: 'Descartar',
        destructive: true,
      });
      if (!ok) return;
    }
    navigate(-1);
  };

  // Aviso del navegador si se cierra con datos sin guardar
  useEffect(() => {
    if (step !== 'review') return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [step]);

  if (step === 'capture') {
    return <CameraCapture onCapture={onCapture} onCancel={() => navigate(-1)} onManual={() => navigate('/nuevo', { replace: true })} />;
  }

  if (step === 'loading') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink text-white">
        <p className="animate-pulse">Abriendo la fotografía…</p>
      </div>
    );
  }

  if (step === 'adjust' && image) {
    return (
      <ImageAdjuster
        image={image}
        defaultEnhancement={settings.defaultEnhancement}
        onBack={() => {
          setFile(null);
          setImage(null);
          setStep('capture');
        }}
        onConfirm={runOcr}
      />
    );
  }

  if (step === 'processing') {
    const pct = Math.round((progress?.stage === 'recognizing' ? progress.progress : progress?.stage === 'done' ? 1 : 0) * 100);
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface px-8 pt-safe text-center">
        <div className="relative mb-8 h-56 w-40 overflow-hidden rounded-2xl bg-white shadow-float">
          {processedUrl && <img src={processedUrl} alt="" className="h-full w-full object-cover opacity-80" />}
          {progress?.stage !== 'done' && (
            <div className="absolute inset-x-0 top-0 h-full animate-scan">
              <div className="h-1 w-full bg-brand-400 shadow-[0_0_16px_4px_rgba(52,196,147,0.6)]" />
            </div>
          )}
          {progress?.stage === 'done' && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <CheckCircle2 className="h-14 w-14 text-brand-600" />
            </div>
          )}
        </div>
        <h1 className="text-[22px] font-bold">{progress?.stage === 'done' ? 'Análisis completado' : 'Analizando ticket'}</h1>
        <p className="mt-1.5 text-[15px] text-ink-mute">{progress?.message ?? ''}</p>
        <div className="mt-6 h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
        <p className="num mt-2 text-[13px] text-ink-faint">{progress?.stage === 'recognizing' ? `${pct} %` : ' '}</p>
        <p className="mt-8 max-w-xs text-[13px] text-ink-faint">El reconocimiento se hace en este dispositivo. La primera vez puede tardar algo más.</p>
      </div>
    );
  }

  if (step === 'missing-ocr') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface px-8 pt-safe text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-warn-50 text-warn-500">
          <WifiOff className="h-8 w-8" />
        </div>
        <h1 className="text-[20px] font-bold">Sin conexión</h1>
        <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-ink-mute">
          Los archivos del reconocimiento de texto todavía no están guardados en este dispositivo. Conéctate a Internet una vez y abre
          Ajustes › OCR › «Preparar uso sin conexión». Mientras tanto puedes introducir el ticket manualmente; la foto se guardará igualmente.
        </p>
        <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
          <Button size="lg" block onClick={manualWithPhoto}>
            Introducir manualmente
          </Button>
          <Button size="lg" variant="ghost" block onClick={() => setStep('adjust')}>
            Volver
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'review' && draft) {
    return (
      <div className="mx-auto min-h-[100dvh] max-w-xl px-4 pl-safe pr-safe">
        <PageHeader
          title="Revisar ticket"
          large={false}
          actions={
            <IconButton label="Cancelar" onClick={cancel}>
              <X className="h-6 w-6" />
            </IconButton>
          }
        />
        <ReceiptEditor
          initial={draft}
          submitting={saving}
          reviewFields={reviewFields}
          onSubmit={(d) => save(d)}
          topNotice={
            <>
              {ocrFailed && (
                <div className="flex gap-3 rounded-2xl bg-warn-50 p-4 text-[14px] text-warn-700" role="alert">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <p>{ocrFailed}</p>
                </div>
              )}
              {!ocrFailed && draft.extractionStatus === 'ocr' && (
                <div className="flex gap-3 rounded-2xl bg-brand-50 p-4 text-[14px] text-brand-700">
                  <ScanLine className="h-5 w-5 shrink-0" />
                  <p>Revisa los datos detectados antes de guardar. El reconocimiento automático puede cometer errores.</p>
                </div>
              )}
              {!online && <p className="text-[13px] text-ink-mute">Estás sin conexión: el ticket se guardará en el dispositivo igualmente.</p>}
            </>
          }
          photo={
            photoUrl && (
              <button type="button" onClick={() => setViewer(true)} className="card pressable flex w-full items-center gap-3 p-3 text-left">
                <img src={processedUrl ?? photoUrl} alt="Fotografía del ticket" className="h-20 w-16 rounded-lg object-cover" />
                <div className="flex-1">
                  <p className="font-semibold">Fotografía del ticket</p>
                  <p className="text-[13px] text-ink-mute">Pulsa para ampliar y comparar con los datos</p>
                </div>
              </button>
            )
          }
        />
        {viewer && photoUrl && <ImageViewer src={processedUrl ?? photoUrl} alt="Fotografía del ticket" onClose={() => setViewer(false)} />}
        {duplicates && (
          <DuplicateSheet
            matches={duplicates.matches}
            saving={saving}
            onCancel={() => setDuplicates(null)}
            onView={async (id) => {
              const ok = await confirm({
                title: 'Abrir el ticket existente',
                message: 'Se descartará el ticket que estás revisando ahora.',
                confirmLabel: 'Abrir',
              });
              if (ok) navigate(`/tickets/${id}`, { replace: true });
            }}
            onSaveAnyway={() => {
              const d = duplicates.draft;
              setDuplicates(null);
              void save(d, true);
            }}
          />
        )}
      </div>
    );
  }

  return null;
}

function useProcessedUrl(canvas: HTMLCanvasElement | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!canvas) {
      setUrl(null);
      return;
    }
    let revoked = false;
    let objectUrl: string | null = null;
    canvas.toBlob(
      (b) => {
        if (!b || revoked) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      },
      'image/jpeg',
      0.8,
    );
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [canvas]);
  return url;
}
