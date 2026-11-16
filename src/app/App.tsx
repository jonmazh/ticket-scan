import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { AppRoutes } from './router';
import { ConfirmProvider, DemoProvider, PeriodProvider, SettingsProvider, ToastProvider } from './providers';
import { ConfirmHost, ToastHost } from '@/components/common/Hosts';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // No se registran datos de tickets en consola
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-danger-50 text-danger-500">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h1 className="text-[20px] font-bold">Algo ha fallado</h1>
        <p className="mt-2 max-w-sm text-[15px] text-ink-mute">
          Se ha producido un error inesperado. Tus datos siguen guardados en el dispositivo.
        </p>
        <button
          type="button"
          className="mt-6 h-12 rounded-xl bg-brand-600 px-6 font-semibold text-white"
          onClick={() => {
            this.setState({ error: null });
            window.location.assign('/');
          }}
        >
          Volver al inicio
        </button>
      </div>
    );
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <ConfirmProvider>
            <SettingsProvider>
              <DemoProvider>
                {(demo) => (
                  // Al cambiar entre datos reales y de demostración se vuelve a montar todo
                  <PeriodProvider key={demo ? 'demo' : 'main'}>
                    <AppRoutes />
                  </PeriodProvider>
                )}
              </DemoProvider>
            </SettingsProvider>
            <ConfirmHost />
            <ToastHost />
          </ConfirmProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
