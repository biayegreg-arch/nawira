'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';

interface TicketRow {
  id: string;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
}

interface TicketListResponse {
  items: TicketRow[];
  nextCursor: string | null;
}

const STATUS_LABEL: Record<TicketRow['status'], string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolu',
  CLOSED: 'Fermé',
};

const STATUS_TONE: Record<TicketRow['status'], 'primary' | 'warning' | 'success' | 'neutral'> = {
  OPEN: 'primary',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export default function MySupportTicketsPage(): React.JSX.Element {
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const res = await api<TicketListResponse>('/api/support-tickets?limit=50');
        setTickets(res.items);
        setCursor(res.nextCursor);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
      }
    }
    void load();
  }, []);

  async function loadMore(): Promise<void> {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50', cursor });
      const res = await api<TicketListResponse>(`/api/support-tickets?${params.toString()}`);
      setTickets((prev) => [...(prev ?? []), ...res.items]);
      setCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:p-8">
      <h1 className="mb-6 text-2xl font-bold leading-tight text-navy md:text-3xl">Mes demandes</h1>
      {error && <p className="break-words text-sm text-danger">{error}</p>}
      {tickets === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune demande pour le moment.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/app/support/${t.id}`}
              className="flex items-center justify-between min-h-11 gap-3 rounded-lg border border-border bg-white p-4 transition-colors hover:bg-gray-50"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy">
                {t.subject}
              </span>
              <Badge tone={STATUS_TONE[t.status]} className="shrink-0">
                {STATUS_LABEL[t.status]}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {tickets !== null && cursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mx-auto mt-4 block min-h-11 w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-navy disabled:opacity-50 sm:w-auto"
        >
          {loadingMore ? 'Chargement…' : 'Charger plus'}
        </button>
      )}
    </div>
  );
}
