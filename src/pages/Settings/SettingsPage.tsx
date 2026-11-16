import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, CloudOff, FlaskConical, HardDrive, Info, Lock, Package, ScanText, SlidersHorizontal, Smartphone } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, cx } from '@/components/common/ui';
import { useConfirm, useDemo, useOnline, useSettings, useToast } from '@/app/providers';
import { BackupSection } from './BackupSection';
import { checkOcrOfflineAvailability, prepareOcrOffline, type OcrAvailability } from '@/features/ocr/ocrService';
import { formatBytes, getStorageInfo, requestPersistentStorage, type StorageInfo } from '@/services/storageService';
import { deleteDemoDatabase } from '@/database/db';
import { seedDemoData } from '@/services/demoService';
import type { CurrencyCode, DateFormatPreference, EnhancementMode, OcrLanguage, PhotoQuality } from '@/types/models';

function SettingRow({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[15px] font-medium">{label}</p>
        {hint && <p className="text-[12.5px] text-ink-mute">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SelectSetting<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-10 max-w-[180px] rounded-xl border border-surface-line bg-white px-3 text-[15px] font-medium outline-none focus:border-brand-500"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-[31px] w-[51px] rounded-full transition', checked ? 'bg-brand-500' : 'bg-surface-line')}
    >
      <span className={cx('absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-[2px]')} />
    </button>
  );
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2 className="section-title mb-2 flex items-center gap-1.5">
      {icon}
      {children}
    </h2>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { settings, update } = useSettings();
  const { demo, setDemo } = useDemo();
  const { toast } = useToast();
  const confirm = useConfirm();
  const online = useOnline();
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [ocr, setOcr] = useState<OcrAvailability | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  const refresh = useCallback(async () => {
    setStorage(await getStorageInfo());
    setOcr(await checkOcrOfflineAvailability(settings.ocrLanguages));
  }, [settings.ocrLanguages]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleEnglish = (on: boolean) => {
    const langs: OcrLanguage[] = on ? ['spa', 'eng'] : ['spa'];
    void update({ ocrLanguages: langs });
  };

  const prepareOffline = async () => {
    setPreparing(true);
    try {
      const res = await prepareOcrOffline(settings.ocrLanguages);
      setOcr(res);
      toast(res.cachedForOffline ? 'El OCR ya puede funcionar sin conexión.' : 'Algunos archivos no se han podido guardar.', res.cachedForOffline ? 'success' : 'error');
    } catch (err) {
      toast(`No se han podido descargar los recursos del OCR: ${(err as Error).message}`, 'error');
    } finally {
      setPreparing(false);
    }
  };

  const toggleDemo = async (on: boolean) => {
    if (on) {
      const ok = await confirm({
        title: 'Activar modo demostración',
        message: 'Se mostrará un conjunto de tickets FICTICIOS guardados aparte. Tus datos reales no se modifican y vuelven a aparecer al desactivarlo.',
        confirmLabel: 'Activar',
      });
      if (!ok) return;
      setDemoBusy(true);
      try {
        await seedDemoData();
        setDemo(true);
        navigate('/');
      } catch (err) {
        toast((err as Error).message, 'error');
      } finally {
        setDemoBusy(false);
      }
    } else {
      setDemoBusy(true);
      setDemo(false);
      await deleteDemoDatabase().catch(() => undefined);
      setDemoBusy(false);
      toast('Modo demostración desactivado y datos ficticios eliminados.');
    }
  };

  const usagePct = storage?.ratio != null ? Math.min(100, storage.ratio * 100) : null;

  return (
    <div className="animate-fade-in space-y-7 pb-8">
      <PageHeader title="Ajustes" />

      <BackupSection />

      <section>
        <SectionTitle icon={<SlidersHorizontal className="h-3.5 w-3.5" />}>Preferencias</SectionTitle>
        <Card className="divide-y divide-surface-line">
          <SettingRow label="Idioma" hint="De momento la interfaz está en español">
            <SelectSetting label="Idioma" value={settings.language} onChange={() => undefined} options={[['es', 'Español']]} />
          </SettingRow>
          <SettingRow label="Moneda">
            <SelectSetting<CurrencyCode>
              label="Moneda"
              value={settings.currency}
              onChange={(v) => update({ currency: v })}
              options={[
                ['EUR', 'Euro (€)'],
                ['USD', 'Dólar ($)'],
                ['GBP', 'Libra (£)'],
              ]}
            />
          </SettingRow>
          <SettingRow label="Formato de fecha">
            <SelectSetting<DateFormatPreference>
              label="Formato de fecha"
              value={settings.dateFormat}
              onChange={(v) => update({ dateFormat: v })}
              options={[
                ['dd/MM/yyyy', '16/11/2026'],
                ['d MMM yyyy', '16 nov 2026'],
              ]}
            />
          </SettingRow>
          <SettingRow label="Calidad de fotografías" hint={settings.photoQuality === 'original' ? 'Se guarda el archivo original sin cambios' : 'Se comprime para ocupar menos'}>
            <SelectSetting<PhotoQuality>
              label="Calidad de fotografías"
              value={settings.photoQuality}
              onChange={(v) => update({ photoQuality: v })}
              options={[
                ['original', 'Original'],
                ['high', 'Alta (comprimida)'],
                ['medium', 'Media (ahorro)'],
              ]}
            />
          </SettingRow>
        </Card>
      </section>

      <section>
        <SectionTitle icon={<ScanText className="h-3.5 w-3.5" />}>Reconocimiento de texto (OCR)</SectionTitle>
        <Card className="divide-y divide-surface-line">
          <SettingRow label="Español" hint="Idioma principal">
            <Badge tone="brand">Activo</Badge>
          </SettingRow>
          <SettingRow label="Inglés" hint="Útil para tickets en inglés (descarga 3 MB)">
            <Toggle label="Reconocer también inglés" checked={settings.ocrLanguages.includes('eng')} onChange={toggleEnglish} />
          </SettingRow>
          <SettingRow label="Mejora de imagen por defecto">
            <SelectSetting<EnhancementMode>
              label="Mejora de imagen por defecto"
              value={settings.defaultEnhancement}
              onChange={(v) => update({ defaultEnhancement: v })}
              options={[
                ['contrast', 'Contraste'],
                ['bw', 'Blanco y negro'],
                ['none', 'Ninguna'],
              ]}
            />
          </SettingRow>
          <SettingRow label="Disposición del texto" hint="Cambia si el OCR mezcla columnas">
            <SelectSetting<'3' | '4' | '6'>
              label="Disposición del texto"
              value={settings.ocrPageSegMode}
              onChange={(v) => update({ ocrPageSegMode: v })}
              options={[
                ['4', 'Columna (recomendado)'],
                ['6', 'Bloque uniforme'],
                ['3', 'Automática'],
              ]}
            />
          </SettingRow>
          <div className="px-4 py-3">
            <div className="flex items-start gap-3">
              {ocr?.cachedForOffline ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" /> : <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-warn-500" />}
              <div className="flex-1 text-[14px]">
                <p className="font-medium">{ocr?.cachedForOffline ? 'OCR disponible sin conexión' : 'OCR aún no preparado para usar sin conexión'}</p>
                <p className="text-ink-mute">
                  {ocr?.cachedForOffline
                    ? 'El motor y los idiomas están guardados en este dispositivo.'
                    : ocr && !ocr.serviceWorkerActive
                      ? 'Abre la app instalada (o recarga la página) para activar la caché offline.'
                      : `Faltan ${ocr?.missing.length ?? '…'} archivos.`}
                </p>
              </div>
            </div>
            {!ocr?.cachedForOffline && (
              <Button variant="secondary" block className="mt-3" loading={preparing} disabled={!online} onClick={prepareOffline}>
                {online ? 'Preparar uso sin conexión' : 'Necesitas conexión para prepararlo'}
              </Button>
            )}
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle icon={<Package className="h-3.5 w-3.5" />}>Productos</SectionTitle>
        <Card onClick={() => navigate('/productos')} className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-[15px] font-medium">Gestionar productos</p>
            <p className="text-[12.5px] text-ink-mute">Renombrar, fusionar, separar y alias</p>
          </div>
          <ChevronRight className="h-5 w-5 text-ink-faint" />
        </Card>
      </section>

      <section id="almacenamiento">
        <SectionTitle icon={<HardDrive className="h-3.5 w-3.5" />}>Almacenamiento</SectionTitle>
        <Card className="p-4">
          {storage?.supported ? (
            <>
              <div className="flex items-baseline justify-between text-[15px]">
                <span className="font-medium">{formatBytes(storage.usageBytes)} usados</span>
                <span className="text-ink-mute">de {formatBytes(storage.quotaBytes)} disponibles (aprox.)</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken">
                <div className={cx('h-full rounded-full', storage.nearlyFull ? 'bg-danger-500' : 'bg-brand-500')} style={{ width: `${Math.max(1, usagePct ?? 0)}%` }} />
              </div>
              {storage.nearlyFull && (
                <p className="mt-2 text-[13px] font-medium text-danger-600">El almacenamiento está casi lleno. Exporta una copia y libera espacio en el dispositivo.</p>
              )}
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-[14px]">
                  Almacenamiento persistente:{' '}
                  <strong>{storage.persisted ? 'concedido' : storage.persisted === false ? 'no concedido' : 'desconocido'}</strong>
                </p>
                {!storage.persisted && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const ok = await requestPersistentStorage();
                      toast(ok ? 'Almacenamiento persistente concedido.' : 'El navegador no lo ha concedido. Instalar la app en la pantalla de inicio ayuda.', ok ? 'success' : 'info');
                      void refresh();
                    }}
                  >
                    Solicitar
                  </Button>
                )}
              </div>
              <p className="mt-2 text-[12.5px] text-ink-mute">Las cifras son orientativas: las calcula el navegador. TicketScan nunca borra tickets automáticamente.</p>
            </>
          ) : (
            <p className="text-[14px] text-ink-mute">Este navegador no informa del espacio disponible.</p>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle icon={<FlaskConical className="h-3.5 w-3.5" />}>Modo demostración</SectionTitle>
        <Card className="divide-y divide-surface-line">
          <SettingRow label="Datos de ejemplo" hint="Tickets ficticios en una base de datos separada">
            <Toggle label="Modo demostración" checked={demo} onChange={(v) => !demoBusy && toggleDemo(v)} />
          </SettingRow>
        </Card>
      </section>

      <section>
        <SectionTitle icon={<Lock className="h-3.5 w-3.5" />}>Privacidad</SectionTitle>
        <Card className="space-y-2 p-4 text-[14px] leading-relaxed text-ink-soft">
          <p>
            <strong>Tus tickets, fotografías y textos reconocidos se guardan solo en este dispositivo</strong>, dentro del almacenamiento del navegador (IndexedDB). El
            reconocimiento de texto se hace en el propio iPhone. TicketScan no tiene cuentas, servidores, analítica ni publicidad.
          </p>
          <p>Lo único que se descarga de Internet son los archivos de la propia aplicación (y sus actualizaciones).</p>
          <p className="text-warn-700">
            Si borras los datos de Safari o del sitio, desinstalas la app o pierdes el dispositivo, perderás la información. Haz copias de seguridad.
          </p>
          <p className="text-ink-mute">Los datos no están cifrados por la aplicación: su protección depende del bloqueo de tu dispositivo.</p>
        </Card>
      </section>

      <section>
        <SectionTitle icon={<Info className="h-3.5 w-3.5" />}>Acerca de</SectionTitle>
        <Card className="divide-y divide-surface-line">
          <SettingRow label="Versión">
            <span className="num text-[15px] text-ink-mute">{__APP_VERSION__}</span>
          </SettingRow>
          <div className="flex gap-3 px-4 py-3 text-[14px] text-ink-soft">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            <p>
              Para instalarla en el iPhone: abre esta dirección en Safari, pulsa <strong>Compartir</strong> y elige <strong>Añadir a pantalla de inicio</strong>.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
