'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { InitialsAvatar } from '@/components/ui/InitialsAvatar';
import { Badge } from '@/components/ui/Badge';
import { UserDetailModal } from '@/components/admin/UserDetailModal';
import { Skeleton } from '@/components/ui/Skeleton';
import type { AdminUser, AdminUserListResponse } from '@/components/admin/types';

function UserRowSkeleton(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 md:rounded-none md:border-x-0 md:border-t-0 md:p-3 md:px-6">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="hidden h-5 w-16 shrink-0 rounded-full md:block" />
      <Skeleton className="hidden h-5 w-16 shrink-0 rounded-full md:block" />
    </div>
  );
}

const ROLE_TONE: Record<AdminUser['role'], 'neutral' | 'primary' | 'warning'> = {
  USER: 'neutral',
  ADMIN: 'primary',
  SUPERADMIN: 'warning',
};

const STATUS_TONE: Record<AdminUser['status'], 'success' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  DELETED: 'danger',
};

export default function AdminUsersPage(): React.JSX.Element {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);

  async function load(reset: boolean, query = q): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (!reset && cursor) params.set('cursor', cursor);
      params.set('limit', '50');
      const res = await api<AdminUserListResponse>(`/api/admin/users?${params.toString()}`);
      setUsers((prev) => (reset ? res.items : [...prev, ...res.items]));
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

  function onSearchSubmit(e: FormEvent): void {
    e.preventDefault();
    void load(true);
  }

  function onUpdated(updated: AdminUser): void {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setSelected(updated);
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSearchSubmit} className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-white px-3.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher par email ou nom…"
            className="min-h-11 w-full min-w-0 bg-transparent text-base text-navy outline-none md:text-sm"
          />
        </div>
        <button
          type="submit"
          className="min-h-11 shrink-0 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white"
        >
          Rechercher
        </button>
      </form>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {!loading && users.length === 0 && !error && (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Aucune utilisatrice trouvée.
        </div>
      )}

      {loading && users.length === 0 && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <UserRowSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Mobile / tablet: stacked cards (no horizontal scroll below md) */}
      <div className="flex flex-col gap-3 md:hidden">
        {users.map((user) => (
          <button
            key={user.id}
            type="button"
            onClick={() => setSelected(user)}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-left"
          >
            <InitialsAvatar name={user.name} email={user.email} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-navy">
                {user.name ?? user.email}
              </div>
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge tone={ROLE_TONE[user.role]}>{user.role}</Badge>
                <Badge tone={STATUS_TONE[user.status]}>{user.status}</Badge>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop / tablet-landscape: real table */}
      {users.length > 0 && (
        <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-border bg-gray-50 text-left text-xs font-medium text-muted-foreground">
                <th className="w-1/2 px-6 py-3">Utilisatrice</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Inscription</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => (
                <tr
                  key={user.id}
                  onClick={() => setSelected(user)}
                  className={`cursor-pointer hover:bg-gray-50 ${
                    i < users.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={user.name} email={user.email} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-navy">
                          {user.name ?? user.email}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={ROLE_TONE[user.role]}>{user.role}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[user.status]}>{user.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && users.length > 0 && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <UserRowSkeleton key={i} />
          ))}
        </div>
      )}

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
        <UserDetailModal user={selected} onClose={() => setSelected(null)} onUpdated={onUpdated} />
      )}
    </div>
  );
}
