'use client';

import { BarChart2 } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { ComingSoonPage } from '@/components/app/ComingSoonPage';

export default function InsightsPage(): React.JSX.Element | null {
  const user = useUser();
  if (!user) return null;

  return (
    <ComingSoonPage
      icon={BarChart2}
      title="Analyses"
      description="Les tendances et analyses de ton cycle arrivent bientôt. On te préviendra dès que c'est prêt."
    />
  );
}
