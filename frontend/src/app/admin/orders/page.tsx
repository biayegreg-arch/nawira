'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatPrice } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { AdminListSkeleton } from '@/components/admin/AdminListSkeleton';
import { RecordDetailModal } from '@/components/admin/RecordDetailModal';

interface Order {
  id: string;
  userId: string | null;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUNDED';
  customerEmail: string | null;
  provider: string;
  providerChargeId: string | null;
  paymentUrl: string | null;
  paymentMethod: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface OrderListResponse {
  items: Order[];
  nextCursor: string | null;
}

const STATUS_OPTIONS = ['PENDING', 'PAID', 'EXPIRED', 'FAILED', 'REFUNDED'] as const;

const STATUS_TONE: Record<
  Order['status'],
  'neutral' | 'primary' | 'success' | 'warning' | 'danger'
> = {
  PENDING: 'warning',
  PAID: 'success',
  EXPIRED: 'neutral',
  FAILED: 'danger',
  REFUNDED: 'primary',
};

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('fr-FR') : '—';
}

export default function AdminOrdersPage(): React.JSX.Element {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);

  async function load(reset: boolean, statusFilter = status): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (!reset && cursor) params.set('cursor', cursor);
      params.set('limit', '50');
      const res = await api<OrderListResponse>(`/api/admin/orders?${params.toString()}`);
      setOrders((prev) => (reset ? res.items : [...prev, ...res.items]));
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

      {loading && orders.length === 0 && <AdminListSkeleton />}

      {!loading && orders.length === 0 && !error && (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Aucune commande trouvée.
        </div>
      )}

      <div className="flex flex-col gap-3 md:hidden">
        {orders.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setSelected(o)}
            className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4 text-left"
          >
            <div className="flex items-center justify-between">
              <span className="truncate text-sm font-semibold text-navy">
                {o.customerEmail ?? o.id}
              </span>
              <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">{fmtDate(o.createdAt)}</div>
            <div className="text-sm font-medium text-navy">{formatPrice(o.amount, o.currency)}</div>
          </button>
        ))}
      </div>

      {orders.length > 0 && (
        <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-gray-50 text-left text-xs font-medium text-muted-foreground">
                <th className="px-6 py-3">Commande</th>
                <th className="px-4 py-3">Montant</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Moyen</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => (
                <tr
                  key={o.id}
                  onClick={() => setSelected(o)}
                  className={`cursor-pointer hover:bg-gray-50 ${
                    i < orders.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <td className="px-6 py-3">
                    <div className="truncate text-sm font-medium text-navy">
                      {o.customerEmail ?? '—'}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{o.id}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-navy">
                    {formatPrice(o.amount, o.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {o.paymentMethod ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {fmtDate(o.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && orders.length > 0 && <AdminListSkeleton rows={3} />}

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
          title="Détail de la commande"
          onClose={() => setSelected(null)}
          fields={[
            { label: 'Email client', value: selected.customerEmail },
            { label: 'Montant', value: formatPrice(selected.amount, selected.currency) },
            {
              label: 'Statut',
              value: <Badge tone={STATUS_TONE[selected.status]}>{selected.status}</Badge>,
            },
            { label: 'Fournisseur', value: selected.provider },
            { label: 'Moyen de paiement', value: selected.paymentMethod },
            { label: 'Référence charge', value: selected.providerChargeId },
            { label: 'Créée le', value: fmtDate(selected.createdAt) },
            { label: 'Expire le', value: fmtDate(selected.expiresAt) },
            { label: 'Payée le', value: fmtDate(selected.paidAt) },
          ]}
        />
      )}
    </div>
  );
}
