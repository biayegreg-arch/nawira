'use client';

import { Crown } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { ComingSoonPage } from '@/components/app/ComingSoonPage';

export default function BillingPage(): React.JSX.Element | null {
  const user = useUser();
  if (!user) return null;

  return (
    <ComingSoonPage
      icon={Crown}
      title="Abonnement"
      description="Les offres Plus et Projet Bébé arrivent bientôt. Pour l'instant, toutes les fonctionnalités disponibles sont gratuites."
    />
  );
}
