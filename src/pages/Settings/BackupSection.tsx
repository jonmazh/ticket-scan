import { useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, FileUp, Save, ShieldCheck } from 'lucide-react';
import { Button, Card, cx } from '@/components/common/ui';
import { Sheet } from '@/components/common/Sheet';
import { useConfirm, useDemo, useSettings, useToast } from '@/app/providers';
import {
  exportBackup,
  exportLinesCsv,
  exportProductsCsv,
  exportReceiptsCsv,
  markBackupDone,
  parseBackupFile,
  restoreBackup,
  BackupValidationError,
  type ParsedBackup,
} from '@/services/backupService';
import { formatBytes } from '@/services/storageService';
import { saveFile, timestampForFile } from '@/utils/download';
import { formatDate, formatDateTime } from '@/utils/dates';
import { useReceipts } from '@/hooks/useData';

const REMIND_AFTER_DAYS = 30;

export function BackupSection() {
  const { settings } = useSettings();
  const { demo } = useDemo();
  const { toast } = useToast();
  const confirm = useConfirm();
  const receipts = useReceipts();
  const fileInput = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<{ blob: Blob; name: string } | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');

  const last = settings.lastBackupAt;
  const days = last ? (Date.now() - new Date(last).getTime()) / 86_400_000 : null;
  const hasData = (receipts?.length ?? 0) > 0;
  const remind = hasData && !demo && (days === null || days > REMIND_AFTER_DAYS);

  const prepare = async () => {
    setExporting('Preparando copia…');
    try {
      const blob = await exportBackup((done, total) => setExporting(`Copiando fotografías ${done}/${total}…`));
      setPrepared({ blob, name: `ticketscan-copia-${timestampForFile()}${demo ? '-demo' : ''}.zip` });
    } catch (err) {
      toast(`No se ha podido crear la copia: ${(err as Error).message}`, 'error');
    } finally {
      setExporting(null);
    }
  };

  const savePrepared = async () => {
    if (!prepared) return;
    const res = await saveFile(prepared.blob, prepared.name);
    if (res === 'cancelled') return;
    if (!demo) await markBackupDone();
    toast(res === 'shared' ? 'Copia compartida. Guárdala en Archivos o en tu nube.' : 'Copia descargada.');
    setPrepared(null);
  };

  const csv = async (kind: 'tickets' | 'productos' | 'lineas') => {
    try {
      const blob = kind === 'tickets' ? await exportReceiptsCsv() : kind === 'productos' ? await exportProductsCsv() : await exportLinesCsv();
      await saveFile(blob, `ticketscan-${kind}-${timestampForFile()}.csv`);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      setParsed(await parseBackupFile(f));
      setMode('merge');
    } catch (err) {
      const msg = err instanceof BackupValidationError ? err.problems.slice(0, 3).join(' ') : (err as Error).message;
      toast(`No se puede importar: ${msg}`, 'error');
    }
  };

  const doImport = async () => {
    if (!parsed) return;
    const ok = await confirm(
      mode === 'replace'
        ? {
            title: '¿Sustituir todos los datos?',
            message: 'Se borrarán TODOS los tickets, productos y fotografías actuales de este dispositivo y se reemplazarán por los de la copia. No se puede deshacer.',
            confirmLabel: 'Sustituir datos',
            destructive: true,
          }
        : {
            title: '¿Importar la copia?',
            message: 'Se añadirán los tickets que no existan. Los ya registrados se omitirán y las referencias repetidas se renumerarán.',
            confirmLabel: 'Importar',
          },
    );
    if (!ok) return;
    setImporting(true);
    try {
      const res = await restoreBackup(parsed, mode);
      setParsed(null);
      toast(
        mode === 'replace'
          ? `Copia restaurada: ${res.receiptsAdded} tickets.`
          : `Importados ${res.receiptsAdded} tickets${res.receiptsSkipped ? `, ${res.receiptsSkipped} ya existían` : ''}${res.referencesChanged ? `, ${res.referencesChanged} referencias renumeradas` : ''}.`,
      );
    } catch (err) {
      toast(`La importación ha fallado y no se ha cambiado nada: ${(err as Error).message}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <section id="copias">
      <h2 className="section-title mb-2">Copias de seguridad</h2>
      <Card className="p-4">
        <div className={cx('flex gap-3 rounded-xl p-3', remind ? 'bg-warn-50 text-warn-700' : 'bg-brand-50 text-brand-700')}>
          {remind ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <ShieldCheck className="h-5 w-5 shrink-0" />}
          <div className="text-[14px]">
            <p className="font-semibold">{last ? `Última copia: ${formatDateTime(last)}` : 'Aún no has hecho ninguna copia'}</p>
            <p className="mt-0.5">
              {remind
                ? 'Tus datos solo están en este dispositivo. Haz una copia y guárdala fuera (Archivos, iCloud Drive, ordenador).'
                : 'Haz copias periódicas: si se borran los datos del navegador, la copia es la única forma de recuperarlos.'}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {prepared ? (
            <Button size="lg" block icon={<Save className="h-5 w-5" />} onClick={savePrepared}>
              Guardar copia ({formatBytes(prepared.blob.size)})
            </Button>
          ) : (
            <Button size="lg" block icon={<Download className="h-5 w-5" />} loading={!!exporting} onClick={prepare}>
              {exporting ?? 'Exportar copia completa (ZIP)'}
            </Button>
          )}
          <Button size="lg" variant="secondary" block icon={<FileUp className="h-5 w-5" />} onClick={() => fileInput.current?.click()}>
            Importar copia de seguridad
          </Button>
          <input ref={fileInput} type="file" accept=".zip,application/zip,application/x-zip-compressed" className="hidden" onChange={onFile} />
        </div>
        <p className="mt-3 text-[12.5px] text-ink-mute">
          El ZIP incluye un JSON con tickets, líneas, productos, alias, ajustes y referencias, y todas las fotografías originales y miniaturas.
        </p>
      </Card>

      <h3 className="section-title mb-2 mt-5">Exportar a Excel (CSV)</h3>
      <Card className="divide-y divide-surface-line overflow-hidden">
        {(
          [
            ['tickets', 'Historial de tickets'],
            ['productos', 'Productos agrupados'],
            ['lineas', 'Líneas de compra'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" onClick={() => csv(k)} className="flex h-[52px] w-full items-center gap-3 px-4 text-left text-[16px] active:bg-surface-sunken">
            <FileSpreadsheet className="h-5 w-5 text-brand-600" /> {l}
          </button>
        ))}
      </Card>
      <p className="mt-2 px-1 text-[12.5px] text-ink-mute">UTF-8, separador «;» y coma decimal, compatibles con Excel en español.</p>

      <Sheet
        open={!!parsed}
        onClose={() => setParsed(null)}
        title="Importar copia"
        footer={
          <Button size="lg" block variant={mode === 'replace' ? 'danger' : 'primary'} loading={importing} onClick={doImport}>
            {mode === 'replace' ? 'Sustituir mis datos' : 'Importar sin duplicar'}
          </Button>
        }
      >
        {parsed && (
          <>
            <Card className="p-4 text-[15px]">
              <p className="font-semibold">Copia válida</p>
              <p className="mt-1 text-ink-mute">Creada el {formatDateTime(parsed.summary.exportedAt)}</p>
              <ul className="mt-3 space-y-1">
                <li>{parsed.summary.receipts} tickets</li>
                <li>{parsed.summary.items} líneas de producto</li>
                <li>{parsed.summary.products} productos</li>
                <li>{parsed.summary.images} imágenes</li>
                {parsed.summary.firstDate && (
                  <li>
                    Compras del {formatDate(parsed.summary.firstDate)} al {formatDate(parsed.summary.lastDate!)}
                  </li>
                )}
              </ul>
            </Card>
            <div className="mt-4 space-y-2">
              {(
                [
                  ['merge', 'Añadir sin duplicar', 'Conserva tus datos actuales y añade los tickets que falten. Las referencias repetidas se renumeran.'],
                  ['replace', 'Sustituir todo', 'Borra los datos actuales de este dispositivo y deja exactamente los de la copia.'],
                ] as const
              ).map(([m, t, d]) => (
                <label key={m} className={cx('card flex cursor-pointer gap-3 p-4', mode === m && 'ring-2 ring-brand-500')}>
                  <input type="radio" name="import-mode" checked={mode === m} onChange={() => setMode(m)} className="mt-1 h-5 w-5 accent-brand-600" />
                  <span>
                    <span className="block font-semibold">{t}</span>
                    <span className="block text-[14px] text-ink-mute">{d}</span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </Sheet>
    </section>
  );
}
