import { ReceiptText } from 'lucide-react';
import { useStoredImageUrl } from '@/hooks/useImage';
import { cx } from './ui';

export function Thumbnail({ imageId, className }: { imageId: string | null; className?: string }) {
  const { url, loading } = useStoredImageUrl(imageId);
  return (
    <div className={cx('relative shrink-0 overflow-hidden rounded-lg bg-surface-sunken', className ?? 'h-14 w-11')}>
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <div className={cx('flex h-full w-full items-center justify-center text-ink-faint', loading && imageId && 'animate-pulse')}>
          <ReceiptText className="h-5 w-5" aria-hidden />
        </div>
      )}
    </div>
  );
}
