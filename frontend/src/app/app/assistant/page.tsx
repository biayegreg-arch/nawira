'use client';

import { MessageCircle } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { ComingSoonPage } from '@/components/app/ComingSoonPage';

export default function AssistantPage(): React.JSX.Element | null {
  const user = useUser();
  if (!user) return null;

  return (
    <ComingSoonPage
      icon={MessageCircle}
      title="Assistant NAWIRA"
      description="L'assistant NAWIRA arrive bientôt pour répondre à tes questions sur ton cycle. On te préviendra dès que c'est prêt."
    />
  );
}
