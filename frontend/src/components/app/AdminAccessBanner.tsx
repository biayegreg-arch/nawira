import Link from 'next/link';
import { ShieldCheck, ArrowRight } from 'lucide-react';

// Shown only to ADMIN/SUPERADMIN on the main dashboard (/app/today) as a
// one-click shortcut to the back-office — admin routes re-check the role
// server-side regardless, this is purely a visibility/convenience surface.
// The account-menu and desktop-sidebar links (UserMenu.tsx, AppSidebar.tsx)
// stay in place; this adds a spot that doesn't require opening a menu.
export function AdminAccessBanner(): React.JSX.Element {
  return (
    <Link
      href="/admin"
      className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-navy px-5 py-3.5 text-white"
    >
      <div className="flex min-w-0 items-center gap-3">
        <ShieldCheck size={18} />
        <span className="text-sm font-semibold">Espace Admin</span>
      </div>
      <ArrowRight size={16} />
    </Link>
  );
}
