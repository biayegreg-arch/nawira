'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Shield,
  Settings,
  Users,
  Crown,
  TrendingUp,
  Heart,
  Search,
  CreditCard,
  Flag,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { InitialsAvatar } from '@/components/ui/InitialsAvatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { AdminComingSoonPanel } from '@/components/admin/AdminComingSoonPanel';
import type { AdminUser, AdminUserListResponse } from '@/components/admin/types';

interface StatsResponse {
  activeUsers: number;
  paidProfiles: number;
}

interface KpiCard {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  value: string | null;
  comingSoon?: boolean;
}

const PLAN_LABEL: Record<AdminUser['plan'], string> = {
  FREE: 'Free',
  PLUS: '👑 Plus',
  BABY: '🍼 Baby',
};
const PLAN_TONE: Record<AdminUser['plan'], 'neutral' | 'primary' | 'warning'> = {
  FREE: 'neutral',
  PLUS: 'primary',
  BABY: 'warning',
};
const STATUS_LABEL: Record<AdminUser['status'], string> = {
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  DELETED: 'Supprimé',
};
const STATUS_TONE: Record<AdminUser['status'], 'success' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  DELETED: 'danger',
};

const PREVIEW_LIMIT = 6;

export default function AdminOverviewPage(): React.JSX.Element {
  const admin = useAdmin();

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsError, setStatsError] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setStats(await api<StatsResponse>('/api/admin/stats'));
      } catch {
        setStatsError(true);
      }
    })();
  }, []);

  async function loadUsers(query: string): Promise<void> {
    setUsersLoading(true);
    setUsersError(null);
    try {
      // Fetch a wider batch than the preview shows, then drop DELETED rows
      // client-side — a deleted account's email is scrambled by
      // deleteAccount() (E8 Part B), so it renders as a garbled
      // "deleted-cm…" string that looks broken in an at-a-glance widget.
      // The route itself stays untouched: /admin/users' full list
      // legitimately wants deleted accounts visible (audit trail), only
      // this compact "recent activity" preview doesn't.
      const params = new URLSearchParams({ limit: String(PREVIEW_LIMIT * 4) });
      if (query) params.set('q', query);
      const res = await api<AdminUserListResponse>(`/api/admin/users?${params.toString()}`);
      setUsers(res.items.filter((u) => u.status !== 'DELETED').slice(0, PREVIEW_LIMIT));
      setTotal(res.total);
    } catch (err) {
      setUsersError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setUsersLoading(false);
    }
  }

  // Initial load only — search re-fetches explicitly on submit.
  useEffect(() => {
    void loadUsers('');
  }, []);

  function onSearchSubmit(e: FormEvent): void {
    e.preventDefault();
    void loadUsers(q);
  }

  const todayLabel = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const kpis: KpiCard[] = [
    {
      key: 'active',
      label: 'Utilisatrices actives',
      icon: Users,
      color: '#6C43C1',
      bg: '#EEE7FA',
      value: stats ? stats.activeUsers.toLocaleString('fr-FR') : null,
    },
    {
      key: 'plus',
      label: 'Abonnées NAWIRA Plus',
      icon: Crown,
      color: '#D9A441',
      bg: '#FBF1D8',
      value: stats ? stats.paidProfiles.toLocaleString('fr-FR') : null,
    },
    {
      key: 'mrr',
      label: 'MRR (Revenus mensuels)',
      icon: TrendingUp,
      color: '#4F9D78',
      bg: '#E2F3EA',
      value: null,
      comingSoon: true,
    },
    {
      key: 'retention',
      label: 'Taux de rétention',
      icon: Heart,
      color: '#D968A6',
      bg: '#F9E4EF',
      value: null,
      comingSoon: true,
    },
  ];

  const canManagePricing = admin.can.includes('pricing:write');

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold leading-tight text-navy md:text-3xl">
            <Shield className="h-[22px] w-[22px] text-primary" aria-hidden="true" />
            Administration NAWIRA
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vue d&rsquo;ensemble — {todayLabel} · Connecté en tant que{' '}
            <span className="break-all font-medium text-navy">{admin.email}</span>{' '}
            <Badge tone={admin.role === 'SUPERADMIN' ? 'warning' : 'primary'} className="ml-1">
              {admin.role}
            </Badge>
          </p>
        </div>
        {canManagePricing && (
          <Link
            href="/admin/pricing"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white sm:self-start"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            Paramètres globaux
          </Link>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.key} className="rounded-xl border border-border bg-white p-4 sm:p-5">
            <div
              className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: kpi.bg }}
            >
              <kpi.icon
                className="h-[18px] w-[18px]"
                style={{ color: kpi.color }}
                aria-hidden="true"
              />
            </div>
            {kpi.comingSoon ? (
              <div className="mb-1 text-sm font-medium text-muted-foreground">
                Bientôt disponible
              </div>
            ) : kpi.value === null && !statsError ? (
              <Skeleton className="mb-1 h-8 w-20" />
            ) : kpi.value === null ? (
              <div className="mb-1 text-2xl font-bold text-navy">—</div>
            ) : (
              <div className="mb-1 text-2xl font-bold text-navy">{kpi.value}</div>
            )}
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Middle section: users preview + revenue placeholders */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Users preview table */}
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <h2 className="flex items-center gap-2 text-base font-bold text-navy">
              <Users className="h-4 w-4 text-primary" aria-hidden="true" />
              Gestion des utilisatrices
            </h2>
            <form onSubmit={onSearchSubmit} className="flex w-full items-center gap-2 sm:w-auto">
              <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-gray-50 px-3 sm:w-auto">
                <Search className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher…"
                  className="min-h-11 w-full min-w-0 bg-transparent text-base text-navy outline-none sm:w-40 md:text-sm"
                />
              </div>
            </form>
          </div>

          {usersError && <div className="px-4 py-4 text-sm text-danger sm:px-6">{usersError}</div>}

          {usersLoading && (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: PREVIEW_LIMIT }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-2.5 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!usersLoading && !usersError && users.length === 0 && (
            <div className="px-4 py-8 text-center text-sm sm:px-6 text-muted-foreground">
              Aucune utilisatrice trouvée.
            </div>
          )}

          {!usersLoading && users.length > 0 && (
            <>
              {/* Mobile: stacked cards */}
              <div className="flex flex-col gap-3 p-4 md:hidden">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center gap-3">
                    <InitialsAvatar name={user.name} email={user.email} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-navy">
                        {user.name ?? user.email}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={PLAN_TONE[user.plan]}>{PLAN_LABEL[user.plan]}</Badge>
                      <Badge tone={STATUS_TONE[user.status]}>{STATUS_LABEL[user.status]}</Badge>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <table className="hidden w-full table-fixed md:table">
                <thead>
                  <tr className="border-b border-border bg-gray-50 text-left text-xs font-medium text-muted-foreground">
                    <th className="w-1/2 px-6 py-3">Utilisatrice</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Inscription</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => (
                    <tr
                      key={user.id}
                      className={i < users.length - 1 ? 'border-b border-border' : ''}
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <InitialsAvatar name={user.name} email={user.email} size="sm" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-navy">
                              {user.name ?? user.email}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={PLAN_TONE[user.plan]}>{PLAN_LABEL[user.plan]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[user.status]}>{STATUS_LABEL[user.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-1 sm:px-6">
            <span className="text-xs text-muted-foreground">
              {total !== null
                ? `Affichage 1–${users.length} sur ${total.toLocaleString('fr-FR')}`
                : ''}
            </span>
            <Link
              href="/admin/users"
              className="flex min-h-11 shrink-0 items-center gap-1.5 text-xs font-semibold text-primary"
            >
              Voir tout
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Revenue panel (placeholder — no recurring-billing model) */}
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-border bg-white p-5">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2">
              <h2 className="flex items-center gap-2 text-base font-bold text-navy">
                <TrendingUp className="h-4 w-4 text-green" aria-hidden="true" />
                Revenus mensuels (MRR)
              </h2>
              <span className="text-xs text-muted-foreground">6 derniers mois</span>
            </div>
            <AdminComingSoonPanel
              icon={TrendingUp}
              iconColor="#4F9D78"
              iconBg="#E2F3EA"
              message="Nécessite un système d'abonnement récurrent — non disponible aujourd'hui."
              minHeight="6rem"
            />
          </div>

          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-white">
            <div className="border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
                <CreditCard className="h-3.5 w-3.5 text-amber" aria-hidden="true" />
                Abonnements &amp; revenus
              </h2>
            </div>
            <AdminComingSoonPanel
              icon={CreditCard}
              iconColor="#D9A441"
              iconBg="#FBF1D8"
              message="Bientôt disponible — aucun abonnement récurrent facturé aujourd'hui."
            />
          </div>
        </div>
      </div>

      {/* Moderation + platform settings (placeholders — no backing model) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <h2 className="flex items-center gap-2 text-base font-bold text-navy">
              <Flag className="h-4 w-4 text-danger" aria-hidden="true" />
              Modération &amp; signalements
            </h2>
          </div>
          <AdminComingSoonPanel
            icon={Flag}
            iconColor="#9CA3AF"
            iconBg="#F3F4F6"
            message="Aucun système de signalement n'existe encore — fonctionnalité à venir."
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <h2 className="flex items-center gap-2 text-base font-bold text-navy">
              <Settings className="h-4 w-4 text-primary" aria-hidden="true" />
              Paramètres de la plateforme
            </h2>
          </div>
          <AdminComingSoonPanel
            icon={Settings}
            iconColor="#9CA3AF"
            iconBg="#F3F4F6"
            message="Les réglages globaux de la plateforme arriveront dans une prochaine version."
          />
        </div>
      </div>
    </div>
  );
}
