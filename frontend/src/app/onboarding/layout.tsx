'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';

export default function OnboardingAuthGate({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element | null {
  const router = useRouter();
  const user = useUser(); // redirects to /login if logged out; returns null while loading/redirecting

  useEffect(() => {
    if (user?.hasProfile) {
      router.replace('/app/today');
    }
  }, [user, router]);

  if (!user || user.hasProfile) return null;

  return <>{children}</>;
}
