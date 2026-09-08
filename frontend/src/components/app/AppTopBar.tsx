'use client';

import { useAuth } from '@/contexts/AuthContext';
import { greetingName } from '@/lib/utils';
import { NotificationBell } from '@/components/app/NotificationBell';
import { GlobalSearch } from '@/components/app/GlobalSearch';
import { UserMenu } from '@/components/app/UserMenu';

export function AppTopBar(): React.JSX.Element {
  const { user } = useAuth();
  const name = user ? greetingName(user.email) : '';

  return (
    <div className="flex items-center gap-4 border-b border-border bg-white px-4 py-3 lg:px-8 lg:py-4">
      <div className="hidden lg:flex lg:flex-1">
        <GlobalSearch />
      </div>
      <div className="flex flex-1 items-center justify-between lg:hidden">
        <span className="text-sm font-semibold text-navy">Bonjour {name} 👋</span>
        <GlobalSearch compact />
      </div>
      {user && <NotificationBell />}
      {user && <UserMenu />}
    </div>
  );
}
