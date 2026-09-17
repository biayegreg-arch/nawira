'use client';

import { WifiOff } from 'lucide-react';
import { timeAgo } from '@/lib/time-ago';

export function OfflineDataBanner({ cachedAt }: { cachedAt: string }): React.JSX.Element {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-soft px-4 py-2.5 text-sm text-navy">
      <WifiOff size={14} className="shrink-0 text-amber" />
      Hors ligne — données de {timeAgo(cachedAt)}.
    </div>
  );
}
