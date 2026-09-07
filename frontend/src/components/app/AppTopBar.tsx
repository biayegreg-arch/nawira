'use client';

import { Search, Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { greetingName } from '@/lib/utils';

export function AppTopBar(): React.JSX.Element {
  const { user } = useAuth();
  const name = user ? greetingName(user.email) : '';

  return (
    <div className="flex items-center gap-4 border-b border-border bg-white px-4 py-3 lg:px-8 lg:py-4">
      <div className="hidden max-w-xl flex-1 lg:block">
        <div className="flex items-center gap-3 rounded-full border border-border bg-gray-50 px-4 py-2.5">
          <Search size={16} className="text-muted-light" />
          <span className="text-sm text-muted-light">Rechercher une information, un article…</span>
        </div>
      </div>
      <div className="flex-1 lg:hidden">
        <span className="text-sm font-semibold text-navy">Bonjour {name} 👋</span>
      </div>
      <div className="hidden flex-1 lg:block" />
      <button
        type="button"
        className="relative hidden p-2 text-navy lg:block"
        aria-label="Notifications"
      >
        <Bell size={20} />
      </button>
      {user && (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
          {name.charAt(0)}
        </div>
      )}
    </div>
  );
}
