'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { AdminListSkeleton } from '@/components/admin/AdminListSkeleton';
import { RecordDetailModal } from '@/components/admin/RecordDetailModal';

interface AdminActionRow {
  id: string;
  actorId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  items: AdminActionRow[];
  nextCursor: string | null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR');
}

export default function AdminAuditLogPage(): React.JSX.Element {
  const [rows, setRows] = useState<AdminActionRow[]>([]);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminActionRow | null>(null);

  async function load(
    reset: boolean,
    actionFilter = action,
    targetFilter = targetType,
  ): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      if (targetFilter) params.set('targetType', targetFilter);
      if (!reset && cursor) params.set('cursor', cursor);
      params.set('limit', '50');
      const res = await api<AuditLogResponse>(`/api/admin/audit-log?${params.toString()}`);
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

  function onSubmit(e: FormEvent): void {
    e.preventDefault();
    void load(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Action (ex: user.role_change)"
          className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3.5 py-3 text-sm text-navy outline-none focus:border-primary"
        />
        <input
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
          placeholder="Type de cible (ex: User)"
          className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3.5 py-3 text-sm text-navy outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white"
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
          Aucune action trouvée.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelected(r)}
            className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 text-left sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-navy">{r.action}</div>
              <div className="truncate text-xs text-muted-foreground">
                {r.targetType ? `${r.targetType} · ${r.targetId ?? '—'}` : '—'} · par {r.actorId}
              </div>
            </div>
            <div className="shrink-0 text-xs text-muted-foreground">{fmtDate(r.createdAt)}</div>
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
          title="Détail de l’action"
          onClose={() => setSelected(null)}
          fields={[
            { label: 'Action', value: selected.action },
            { label: 'Acteur', value: selected.actorId },
            { label: 'Type de cible', value: selected.targetType },
            { label: 'ID cible', value: selected.targetId },
            { label: 'IP', value: selected.ip },
            { label: 'User-Agent', value: selected.userAgent },
            { label: 'Date', value: fmtDate(selected.createdAt) },
          ]}
          raw={{ label: 'Métadonnées', value: selected.metadata }}
        />
      )}
    </div>
  );
}
