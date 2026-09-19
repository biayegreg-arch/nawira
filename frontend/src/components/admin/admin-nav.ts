import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Wallet,
  ScrollText,
  Inbox,
  Mail,
  Gauge,
  type LucideIcon,
} from 'lucide-react';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  // Only Users is wired to a real page this pass — every other section has
  // a real backend route but no screen yet (see .planning/banani/admin.md).
  available: boolean;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin', label: "Vue d'ensemble", icon: LayoutDashboard, available: true },
  { href: '/admin/users', label: 'Utilisatrices', icon: Users, available: true },
  { href: '/admin/orders', label: 'Commandes', icon: ShoppingCart, available: false },
  { href: '/admin/withdrawals', label: 'Retraits', icon: Wallet, available: false },
  { href: '/admin/audit-log', label: "Journal d'audit", icon: ScrollText, available: false },
  { href: '/admin/outbox', label: 'File de sortie', icon: Inbox, available: false },
  { href: '/admin/email-queue', label: 'File emails', icon: Mail, available: false },
  { href: '/admin/rate-limits', label: 'Limites de débit', icon: Gauge, available: false },
];
