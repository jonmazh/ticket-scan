import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getMainDb, setActiveDatabase } from '@/database/db';
import { DEFAULT_SETTINGS, updateSettings } from '@/services/settingsService';
import type { AppSettings } from '@/types/models';
import type { Period } from '@/utils/dates';

// ---------------------------------------------------------------------------
// Periodo seleccionado (compartido por Resumen, Tickets y Productos)
// ---------------------------------------------------------------------------

interface PeriodCtx {
  period: Period;
  setPeriod: (p: Period) => void;
}
const PeriodContext = createContext<PeriodCtx | null>(null);
const PERIOD_KEY = 'ticketscan.period';

function readStoredPeriod(): Period {
  try {
    const raw = sessionStorage.getItem(PERIOD_KEY);
    if (raw) return JSON.parse(raw) as Period;
  } catch {
    /* almacenamiento no disponible */
  }
  return { kind: 'preset', preset: 'this-month' };
}

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriodState] = useState<Period>(readStoredPeriod);
  const setPeriod = useCallback((p: Period) => {
    setPeriodState(p);
    try {
      sessionStorage.setItem(PERIOD_KEY, JSON.stringify(p));
    } catch {
      /* ignorar */
    }
  }, []);
  const value = useMemo(() => ({ period, setPeriod }), [period, setPeriod]);
  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod(): PeriodCtx {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error('PeriodProvider no encontrado');
  return ctx;
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

interface SettingsCtx {
  settings: AppSettings;
  loaded: boolean;
  update: (patch: Partial<AppSettings>) => Promise<void>;
}
const SettingsContext = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const record = useLiveQuery(() => getMainDb().settings.get('app'), [], null);
  const settings = useMemo<AppSettings>(
    () => ({ ...DEFAULT_SETTINGS, ...((record?.value as Partial<AppSettings>) ?? {}) }),
    [record],
  );
  const update = useCallback(async (patch: Partial<AppSettings>) => {
    await updateSettings(patch);
  }, []);
  const value = useMemo(() => ({ settings, loaded: record !== null, update }), [settings, record, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsCtx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('SettingsProvider no encontrado');
  return ctx;
}

// ---------------------------------------------------------------------------
// Modo demostración (base de datos separada)
// ---------------------------------------------------------------------------

interface DemoCtx {
  demo: boolean;
  setDemo: (on: boolean) => void;
}
const DemoContext = createContext<DemoCtx | null>(null);
const DEMO_KEY = 'ticketscan.demo';

function readDemo(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

export function DemoProvider({ children }: { children: (demo: boolean) => ReactNode }) {
  const [demo, setDemoState] = useState(() => {
    const d = readDemo();
    setActiveDatabase(d ? 'demo' : 'main');
    return d;
  });
  const setDemo = useCallback((on: boolean) => {
    setActiveDatabase(on ? 'demo' : 'main');
    try {
      localStorage.setItem(DEMO_KEY, on ? '1' : '0');
    } catch {
      /* ignorar */
    }
    setDemoState(on);
  }, []);
  const value = useMemo(() => ({ demo, setDemo }), [demo, setDemo]);
  return <DemoContext.Provider value={value}>{children(demo)}</DemoContext.Provider>;
}

export function useDemo(): DemoCtx {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('DemoProvider no encontrado');
  return ctx;
}

// ---------------------------------------------------------------------------
// Avisos (toasts)
// ---------------------------------------------------------------------------

export type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}
interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
}
const ToastContext = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3200);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ toast, toasts, dismiss }), [toast, toasts, dismiss]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('ToastProvider no encontrado');
  return ctx;
}

// ---------------------------------------------------------------------------
// Confirmaciones (antes de borrar o sustituir datos)
// ---------------------------------------------------------------------------

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}
interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}
interface ConfirmCtx {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  pending: PendingConfirm | null;
  close: (ok: boolean) => void;
}
const ConfirmContext = createContext<ConfirmCtx | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })),
    [],
  );
  const close = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
    },
    [pending],
  );
  const value = useMemo(() => ({ confirm, pending, close }), [confirm, pending, close]);
  return <ConfirmContext.Provider value={value}>{children}</ConfirmContext.Provider>;
}

export function useConfirm(): ConfirmCtx['confirm'] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('ConfirmProvider no encontrado');
  return ctx.confirm;
}

export function useConfirmState() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('ConfirmProvider no encontrado');
  return ctx;
}

// ---------------------------------------------------------------------------
// Estado de conexión
// ---------------------------------------------------------------------------

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
