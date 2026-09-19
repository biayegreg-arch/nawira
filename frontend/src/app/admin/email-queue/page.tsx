'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { AdminListSkeleton } from '@/components/admin/AdminListSkeleton';
import { RecordDetailModal } from '@/components/admin/RecordDetailModal';

interface EmailJobRow {
  id: string;
  to: string;
  subject: string;
  bodyPreview: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'DEAD';
  attempts: number;
  lastError: string | null;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
}

interface EmailQueueResponse {
  items: EmailJobRow[];
  nextCursor: string | null;
}

const STATUS_OPTIONS = ['PENDING', 'SENT', 'FAILED', 'DEAD'] as const;

const STATUS_TONE: Record<
  EmailJobRow['status'],
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

export default function AdminEmailQueuePage(): React.JSX.Element {
  const [rows, setRows] = useState<EmailJobRow[]>([]);
  const [status, setStatus] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EmailJobRow | null>(null);

  async function load(reset: boolean, statusFilter = status): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (!reset && cursor) params.set('cursor', cursor);
      params.set('limit', '50');
      const res = await api<EmailQueueResponse>(`/api/admin/email-queue?${params.toString()}`);
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
    void load(true, '');
  }, []);

  function onStatusChange(value: string): void {
    setStatus(value);
    void load(true, value);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="rounded-lg border border-border bg-white px-3.5 py-3 text-sm text-navy outline-none focus:border-primary"
        >
          <option value="">Tous les statuts</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {loading && rows.length === 0 && <AdminListSkeleton />}

      {!loading && rows.length === 0 && !error && (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Aucun email en file.
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
              <div className="truncate text-sm font-semibold text-navy">{r.subject}</div>
              <div className="truncate text-xs text-muted-foreground">
                {r.to} · {fmtDate(r.createdAt)}
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
          className="self-center rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-navy"
        >
          Charger plus
        </button>
      )}

      {selected && (
        <RecordDetailModal
          title="Détail de l’email"
          onClose={() => setSelected(null)}
          fields={[
            { label: 'Destinataire', value: selected.to },
            { label: 'Sujet', value: selected.subject },
            {
              label: 'Statut',
              value: <Badge tone={STATUS_TONE[selected.status]}>{selected.status}</Badge>,
            },
            { label: 'Tentatives', value: selected.attempts },
            { label: 'Prévu le', value: fmtDate(selected.scheduledAt) },
            { label: 'Envoyé le', value: fmtDate(selected.sentAt) },
            { label: 'Dernière erreur', value: selected.lastError },
          ]}
        >
          <div>
            <div className="mb-1.5 text-xs font-medium text-navy">Aperçu du corps</div>
            <p className="rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-body">
              {selected.bodyPreview || '—'}
            </p>
          </div>
        </RecordDetailModal>
      )}
    </div>
  );
}
