'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { AdminListSkeleton } from '@/components/admin/AdminListSkeleton';

interface TicketRow {
  id: string;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  userEmailMasked: string;
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

export default function AdminSupportPage(): React.JSX.Element {
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [status, setStatus] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (status) params.set('status', status);
        const res = await api<TicketListResponse>(
          `/api/admin/support-tickets?${params.toString()}`,
        );
        setTickets(res.items);
        setCursor(res.nextCursor);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
      }
    }
    void load();
  }, [status]);

  async function loadMore(): Promise<void> {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50', cursor });
      if (status) params.set('status', status);
      const res = await api<TicketListResponse>(`/api/admin/support-tickets?${params.toString()}`);
      setTickets((prev) => [...(prev ?? []), ...res.items]);
      setCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Support</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy"
        >
          <option value="">Tous les statuts</option>
          <option value="OPEN">Ouvert</option>
          <option value="IN_PROGRESS">En cours</option>
          <option value="RESOLVED">Résolu</option>
          <option value="CLOSED">Fermé</option>
        </select>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {tickets === null ? (
        <AdminListSkeleton />
      ) : tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune demande de support.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/admin/support/${t.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-gray-50"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-navy">{t.subject}</div>
                <div className="text-xs text-muted-foreground">
                  {t.userEmailMasked} · {t.messageCount} message{t.messageCount > 1 ? 's' : ''}
                </div>
              </div>
              <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
            </Link>
          ))}
        </div>
      )}

      {tickets !== null && cursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="self-center rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-navy disabled:opacity-50"
        >
          {loadingMore ? 'Chargement…' : 'Charger plus'}
        </button>
      )}
    </div>
  );
}
