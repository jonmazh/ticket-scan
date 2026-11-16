import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/pages/Dashboard/DashboardPage';
import { ReceiptsPage } from '@/pages/Receipts/ReceiptsPage';
import { ReceiptDetailPage } from '@/pages/ReceiptDetail/ReceiptDetailPage';
import { ReceiptEditPage } from '@/pages/ReceiptDetail/ReceiptEditPage';
import { ManualReceiptPage } from '@/pages/ReceiptReview/ManualReceiptPage';
import { ProductsPage } from '@/pages/Products/ProductsPage';
import { ProductDetailPage } from '@/pages/ProductDetail/ProductDetailPage';
import { SettingsPage } from '@/pages/Settings/SettingsPage';
import { ScanPage } from '@/pages/Scan/ScanPage';
import { EmptyState } from '@/components/common/ui';
import { Compass } from 'lucide-react';

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="tickets" element={<ReceiptsPage />} />
          <Route path="tickets/:id" element={<ReceiptDetailPage />} />
          <Route path="productos" element={<ProductsPage />} />
          <Route path="productos/:id" element={<ProductDetailPage />} />
          <Route path="ajustes" element={<SettingsPage />} />
          <Route path="*" element={<EmptyState icon={<Compass className="h-8 w-8" />} title="Página no encontrada" />} />
        </Route>
        <Route path="escanear" element={<ScanPage />} />
        <Route path="nuevo" element={<ManualReceiptPage />} />
        <Route path="tickets/:id/editar" element={<ReceiptEditPage />} />
      </Routes>
    </>
  );
}
