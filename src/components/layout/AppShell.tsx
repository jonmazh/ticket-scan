import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { BarChart3, Camera, FlaskConical, Package, ReceiptText, Settings, WifiOff, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { cx } from '@/components/common/ui';
import { useDemo, useOnline } from '@/app/providers';
import { getStorageInfo } from '@/services/storageService';

const TABS = [
  { to: '/', label: 'Resumen', icon: BarChart3, end: true },
  { to: '/tickets', label: 'Tickets', icon: ReceiptText },
  null,
  { to: '/productos', label: 'Productos', icon: Package },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
] as const;

function BottomNav() {
  const navigate = useNavigate();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-line/80 bg-white/90 pb-safe backdrop-blur-xl"
      aria-label="Navegación principal"
    >
      <div className="mx-auto flex h-[68px] max-w-xl items-stretch px-2">
        {TABS.map((t) =>
          t === null ? (
            <div key="scan" className="flex flex-1 items-start justify-center">
              <button
                type="button"
                onClick={() => navigate('/escanear')}
                aria-label="Escanear ticket"
                className="pressable -mt-5 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-brand-600 text-white shadow-fab ring-4 ring-white"
              >
                <Camera className="h-7 w-7" />
              </button>
            </div>
          ) : (
            <NavLink
              key={t.to}
              to={t.to}
              end={'end' in t ? t.end : undefined}
              className={({ isActive }) =>
                cx(
                  'flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition',
                  isActive ? 'text-brand-600' : 'text-ink-faint',
                )
              }
            >
              <t.icon className="h-6 w-6" strokeWidth={2} aria-hidden />
              {t.label}
            </NavLink>
          ),
        )}
      </div>
    </nav>
  );
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError() {
      /* sin service worker: la app sigue funcionando con conexión */
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-4 bottom-nav-offset z-40 mx-auto flex max-w-md animate-slide-up items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-float">
      <span className="flex-1 text-[14px]">Hay una nueva versión de TicketScan.</span>
      <button type="button" className="rounded-lg bg-white/15 px-3 py-1.5 text-[14px] font-semibold" onClick={() => updateServiceWorker(true)}>
        Actualizar
      </button>
      <button type="button" aria-label="Más tarde" onClick={() => setNeedRefresh(false)} className="opacity-70">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function StatusBanners() {
  const { demo } = useDemo();
  const online = useOnline();
  const navigate = useNavigate();
  const [nearlyFull, setNearlyFull] = useState(false);
  useEffect(() => {
    getStorageInfo().then((i) => setNearlyFull(i.nearlyFull)).catch(() => undefined);
  }, []);
  return (
    <>
      {demo && (
        <button
          type="button"
          onClick={() => navigate('/ajustes')}
          className="flex w-full items-center justify-center gap-2 bg-warn-500 px-4 pb-1.5 pt-safe text-[13px] font-semibold text-white"
        >
          <FlaskConical className="mt-1.5 h-4 w-4" />
          <span className="mt-1.5">Modo demostración: datos ficticios</span>
        </button>
      )}
      {!online && (
        <div className={cx('flex items-center justify-center gap-2 bg-ink-soft px-4 pb-1.5 text-[13px] text-white', !demo && 'pt-safe')}>
          <WifiOff className="mt-1.5 h-4 w-4" />
          <span className="mt-1.5">Sin conexión. Tus datos siguen disponibles en el dispositivo.</span>
        </div>
      )}
      {nearlyFull && (
        <button
          type="button"
          onClick={() => navigate('/ajustes#almacenamiento')}
          className={cx('w-full bg-danger-500 px-4 pb-1.5 text-[13px] font-semibold text-white', !demo && online && 'pt-safe')}
        >
          <span className="mt-1.5 inline-block">El almacenamiento está casi lleno. Revisa Ajustes.</span>
        </button>
      )}
    </>
  );
}

export function AppShell() {
  return (
    <div className="min-h-[100dvh] pl-safe pr-safe">
      <StatusBanners />
      <main className="mx-auto w-full max-w-xl px-4 mb-nav">
        <Outlet />
      </main>
      <UpdatePrompt />
      <BottomNav />
    </div>
  );
}
