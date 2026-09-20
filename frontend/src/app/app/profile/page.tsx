'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { User, Droplet, Heart, Settings, HelpCircle, LogOut, ChevronRight } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { staggerDelay } from '@/lib/utils';
import { formatFrenchDate } from '@/lib/format-date';
import { GOAL_LABELS, CONCERN_LABELS } from '@/lib/profile-labels';
import { ProfileHeaderCard } from '@/components/profile/ProfileHeaderCard';
import { ProfileInfoSection, ProfileField } from '@/components/profile/ProfileInfoSection';
import { LogoutButton } from '@/components/app/LogoutButton';

interface ProfileResponse {
  profile: {
    birthDate: string;
    goal: string;
    usualCycleLength: number | null;
    usualPeriodLength: number | null;
    trackedConcerns: string[];
    notificationLevel: string;
    createdAt: string;
  };
  stats: { monthsActive: number; daysTracked: number; cyclesCompleted: number };
}

function ageFromBirthDate(iso: string): number {
  const birth = new Date(iso);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export default function ProfilePage(): React.JSX.Element | null {
  const user = useUser();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await api<ProfileResponse>('/api/profile');
      setData(res);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!user) return null;

  if (error) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger ton profil. Réessaie plus tard.
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:p-8">
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  const { profile, stats } = data;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-bold leading-tight text-navy md:text-3xl">
          <span className="text-2xl md:text-3xl">👤</span>
          Mon profil
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gère tes informations personnelles et tes préférences.
        </p>
      </div>

      <div className="animate-fade-in-up mb-6">
        <ProfileHeaderCard email={user.email} stats={stats} />
      </div>

      <div className="flex flex-col gap-6">
        <div className="animate-fade-in-up" style={staggerDelay(1)}>
          <ProfileInfoSection
            icon={User}
            iconClassName="text-primary"
            title="Informations personnelles"
          >
            <ProfileField label="Adresse e-mail" value={user.email} />
            <ProfileField
              label="Date de naissance"
              value={`${formatFrenchDate(profile.birthDate)} (${ageFromBirthDate(profile.birthDate)} ans)`}
            />
          </ProfileInfoSection>
        </div>

        <div className="animate-fade-in-up" style={staggerDelay(2)}>
          <ProfileInfoSection
            icon={Droplet}
            iconClassName="text-rose"
            title="Informations sur le cycle"
          >
            <ProfileField
              label="Durée moyenne du cycle déclarée"
              value={
                profile.usualCycleLength ? `${profile.usualCycleLength} jours` : 'Non renseignée'
              }
            />
            <ProfileField
              label="Durée moyenne des règles déclarée"
              value={
                profile.usualPeriodLength ? `${profile.usualPeriodLength} jours` : 'Non renseignée'
              }
            />
          </ProfileInfoSection>
        </div>

        <div className="animate-fade-in-up" style={staggerDelay(3)}>
          <ProfileInfoSection icon={Heart} iconClassName="text-danger" title="Santé et bien-être">
            <div>
              <div className="mb-1 text-xs font-semibold text-muted-foreground">
                Préoccupations suivies
              </div>
              {profile.trackedConcerns.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.trackedConcerns.map((c) => (
                    <span
                      key={c}
                      className="break-words rounded-full bg-amber-soft px-2 py-1 text-xs text-amber"
                    >
                      {CONCERN_LABELS[c] ?? c}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucune préoccupation suivie pour l&rsquo;instant.
                </p>
              )}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-muted-foreground">Objectif</div>
              <span className="inline-block rounded-full bg-green-soft px-2 py-1 text-xs text-green">
                {GOAL_LABELS[profile.goal] ?? profile.goal}
              </span>
            </div>
          </ProfileInfoSection>
        </div>
      </div>

      {/* Mobile-only account links — no sidebar to reach these from on mobile. */}
      <div className="mt-6 flex flex-col gap-1 rounded-xl border border-border bg-white p-2 lg:hidden">
        <Link
          href="/app/settings"
          className="flex min-h-11 items-center justify-between rounded-lg px-3 py-3 text-sm text-navy"
        >
          <span className="flex items-center gap-3">
            <Settings size={18} className="text-muted-foreground" />
            Paramètres
          </span>
          <ChevronRight size={16} className="text-muted-light" />
        </Link>
        <Link
          href="/app/help"
          className="flex min-h-11 items-center justify-between rounded-lg px-3 py-3 text-sm text-navy"
        >
          <span className="flex items-center gap-3">
            <HelpCircle size={18} className="text-muted-foreground" />
            Centre d&rsquo;aide
          </span>
          <ChevronRight size={16} className="text-muted-light" />
        </Link>
        <LogoutButton className="flex items-center gap-3 rounded-lg min-h-11 px-3 py-3 text-left text-sm text-danger">
          <LogOut size={18} />
          Déconnexion
        </LogoutButton>
      </div>
    </div>
  );
}
