'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

interface Top10Entry {
  key: string;
  hits: number;
  expiresAt: string | null;
}

interface BucketSummary {
  bucket: string;
  totalKeys: number;
  top10: Top10Entry[];
  truncated?: boolean;
}

interface RateLimitsResponse {
  buckets: BucketSummary[];
  note?: string;
}

function fmtExpiry(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('fr-FR') : '—';
}

function BucketSkeleton(): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Skeleton className="mb-3 h-4 w-32" />
      <Skeleton className="h-3 w-48" />
    </div>
  );
}

export default function AdminRateLimitsPage(): React.JSX.Element {
  const [buckets, setBuckets] = useState<BucketSummary[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api<RateLimitsResponse>('/api/admin/rate-limits');
        setBuckets(res.buckets);
        setNote(res.note ?? null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <BucketSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && note && (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {note === 'redis not configured'
            ? "Redis n'est pas configuré — les limites de débit ne sont pas actives."
            : note}
        </div>
      )}

      {!loading && !note && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {buckets.map((b) => (
            <div key={b.bucket} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-navy">{b.bucket}</div>
                <Badge tone={b.totalKeys > 0 ? 'primary' : 'neutral'}>
                  {b.totalKeys} clé{b.totalKeys > 1 ? 's' : ''}
                </Badge>
              </div>
              {b.truncated && (
                <div className="mt-1 text-xs text-amber">Liste tronquée (limite atteinte)</div>
              )}

              {b.top10.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">Aucune clé active.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {b.top10.map((entry) => (
                    <div
                      key={entry.key}
                      className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 truncate font-medium text-navy" title={entry.key}>
                        {entry.key}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {entry.hits} hit{entry.hits > 1 ? 's' : ''} · expire{' '}
                        {fmtExpiry(entry.expiresAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
