'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { AdminListSkeleton } from '@/components/admin/AdminListSkeleton';
import { RecordDetailModal } from '@/components/admin/RecordDetailModal';

interface OutboxEventRow {
  id: string;
  kind: string;
  payload: unknown;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'DEAD';
  attempts: number;
  lastError: string | null;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
}

interface OutboxListResponse {
  items: OutboxEventRow[];
  nextCursor: string | null;
}

const STATUS_OPTIONS = ['PENDING', 'SENT', 'FAILED', 'DEAD'] as const;

const STATUS_TONE: Record<
  OutboxEventRow['status'],
  'neutral' | 'primary' | 'success' | 'warning' | 'danger'
> = {
  PENDING: 'warning',
  SENT: 'success',
  FAILED: 'danger',
  DEAD: 'neutral',
};

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('fr-FR') : '—';
}

export default function AdminOutboxPage(): React.JSX.Element {
  const [rows, setRows] = useState<OutboxEventRow[]>([]);
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OutboxEventRow | null>(null);

  async function load(reset: boolean, statusFilter = status, kindFilter = kind): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (kindFilter) params.set('kind', kindFilter);
      if (!reset && cursor) params.set('cursor', cursor);
      params.set('limit', '50');
      const res = await api<OutboxListResponse>(`/api/admin/outbox?${params.toString()}`);
      setRows((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true, '', '');
  }, []);

  function onStatusChange(value: string): void {
    setStatus(value);
    void load(true, value);
  }

  function onSubmit(e: FormEvent): void {
    e.preventDefault();
    void load(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-border bg-white px-3.5 py-3 text-base text-navy outline-none focus:border-primary sm:w-auto md:text-sm"
        >
          <option value="">Tous les statuts</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          placeholder="Type (ex: notification.payment_received)"
          className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-white px-3.5 py-3 text-base text-navy outline-none focus:border-primary sm:flex-1 md:text-sm"
        />
        <button
          type="submit"
          className="min-h-11 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white sm:w-auto"
        >
          Filtrer
        </button>
      </form>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {loading && rows.length === 0 && <AdminListSkeleton />}

      {!loading && rows.length === 0 && !error && (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Aucun évènement trouvé.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelected(r)}
            className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4 text-left sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-navy">{r.kind}</div>
              <div className="truncate text-xs text-muted-foreground">
                {r.attempts} tentative{r.attempts > 1 ? 's' : ''} · {fmtDate(r.createdAt)}
              </div>
            </div>
            <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
          </button>
        ))}
      </div>

      {loading && rows.length > 0 && <AdminListSkeleton rows={3} />}

      {hasMore && !loading && (
        <button
          type="button"
          onClick={() => void load(false)}
          className="min-h-11 w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-navy sm:w-auto sm:self-center"
        >
          Charger plus
        </button>
      )}

      {selected && (
        <RecordDetailModal
          title="Détail de l’évènement"
          onClose={() => setSelected(null)}
          fields={[
            { label: 'Type', value: selected.kind },
            {
              label: 'Statut',
              value: <Badge tone={STATUS_TONE[selected.status]}>{selected.status}</Badge>,
            },
            { label: 'Tentatives', value: selected.attempts },
            { label: 'Prévu le', value: fmtDate(selected.scheduledAt) },
            { label: 'Envoyé le', value: fmtDate(selected.sentAt) },
            { label: 'Dernière erreur', value: selected.lastError },
          ]}
          raw={{ label: 'Payload', value: selected.payload }}
        />
      )}
    </div>
  );
}
