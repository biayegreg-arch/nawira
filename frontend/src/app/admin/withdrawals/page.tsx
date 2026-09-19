'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatPrice } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { AdminListSkeleton } from '@/components/admin/AdminListSkeleton';
import {
  WithdrawalDetailModal,
  WITHDRAWAL_STATUS_TONE,
  type AdminWithdrawal,
} from '@/components/admin/WithdrawalDetailModal';

interface WithdrawalListResponse {
  items: AdminWithdrawal[];
  nextCursor: string | null;
}

const STATUS_OPTIONS = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('fr-FR') : '—';
}

export default function AdminWithdrawalsPage(): React.JSX.Element {
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [status, setStatus] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminWithdrawal | null>(null);

  async function load(reset: boolean, statusFilter = status): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (!reset && cursor) params.set('cursor', cursor);
      params.set('limit', '50');
      const res = await api<WithdrawalListResponse>(`/api/admin/withdrawals?${params.toString()}`);
      setWithdrawals((prev) => (reset ? res.items : [...prev, ...res.items]));
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

  function onUpdated(updated: AdminWithdrawal): void {
    setWithdrawals((prev) => prev.map((w) => (w.id === updated.id ? { ...w, ...updated } : w)));
    setSelected((prev) => (prev ? { ...prev, ...updated } : prev));
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

      {loading && withdrawals.length === 0 && <AdminListSkeleton />}

      {!loading && withdrawals.length === 0 && !error && (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Aucun retrait trouvé.
        </div>
      )}

      <div className="flex flex-col gap-3 md:hidden">
        {withdrawals.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setSelected(w)}
            className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4 text-left"
          >
            <div className="flex items-center justify-between">
              <span className="truncate text-sm font-semibold text-navy">
                {w.destination?.phone ?? w.id}
              </span>
              <Badge tone={WITHDRAWAL_STATUS_TONE[w.status]}>{w.status}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">{fmtDate(w.requestedAt)}</div>
            <div className="text-sm font-medium text-navy">{formatPrice(w.amount, w.currency)}</div>
          </button>
        ))}
      </div>

      {withdrawals.length > 0 && (
        <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-gray-50 text-left text-xs font-medium text-muted-foreground">
                <th className="px-6 py-3">Destination</th>
                <th className="px-4 py-3">Montant</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Demandé le</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w, i) => (
                <tr
                  key={w.id}
                  onClick={() => setSelected(w)}
                  className={`cursor-pointer hover:bg-gray-50 ${
                    i < withdrawals.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <td className="px-6 py-3">
                    <div className="truncate text-sm font-medium text-navy">
                      {w.destination?.phone ?? '—'}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{w.id}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-navy">
                    {formatPrice(w.amount, w.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={WITHDRAWAL_STATUS_TONE[w.status]}>{w.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {fmtDate(w.requestedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && withdrawals.length > 0 && <AdminListSkeleton rows={3} />}

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
        <WithdrawalDetailModal
          withdrawal={selected}
          onClose={() => setSelected(null)}
          onUpdated={onUpdated}
        />
      )}
    </div>
  );
}
