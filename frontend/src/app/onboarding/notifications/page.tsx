'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellDot, BellOff } from 'lucide-react';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { OptionCard } from '@/components/onboarding/OptionCard';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';

type NotificationLevel = 'NORMAL' | 'DISCREET' | 'NONE';

const OPTIONS: Array<{
  value: NotificationLevel;
  title: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    value: 'NORMAL',
    title: 'Normales',
    description: 'Rappels et alertes complètes.',
    icon: <Bell className="h-5 w-5 text-primary" />,
  },
  {
    value: 'DISCREET',
    title: 'Discrètes',
    description: 'Notifications sans détails visibles.',
    icon: <BellDot className="h-5 w-5 text-primary" />,
  },
  {
    value: 'NONE',
    title: 'Aucune',
    description: 'Pas de notifications.',
    icon: <BellOff className="h-5 w-5 text-primary" />,
  },
];

export default function OnboardingNotificationsPage(): React.JSX.Element {
  const router = useRouter();
  const [level, setLevel] = useState<NotificationLevel>('NORMAL');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onContinue(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/profile', {
        method: 'PATCH',
        body: { notificationLevel: level },
      });
      router.push('/onboarding/ready');
    } catch {
      setError('Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingLayout step={10} backHref="/onboarding/consent">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">Notifications</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Choisis le niveau de notifications qui te convient.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              selected={level === opt.value}
              onClick={() => setLevel(opt.value)}
              icon={opt.icon}
              title={opt.title}
              description={opt.description}
            />
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button onClick={onContinue} disabled={submitting} className="w-full">
          {submitting ? 'Enregistrement…' : 'Continuer'}
        </Button>
      </div>
    </OnboardingLayout>
  );
}
