import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Wallet,
  ScrollText,
  Inbox,
  Mail,
  Gauge,
  Tag,
  type LucideIcon,
} from 'lucide-react';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  // All sections are wired to a real page (see .planning/banani/admin.md).
  available: boolean;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin', label: "Vue d'ensemble", icon: LayoutDashboard, available: true },
  { href: '/admin/users', label: 'Utilisatrices', icon: Users, available: true },
  { href: '/admin/orders', label: 'Commandes', icon: ShoppingCart, available: true },
  { href: '/admin/withdrawals', label: 'Retraits', icon: Wallet, available: true },
  { href: '/admin/audit-log', label: "Journal d'audit", icon: ScrollText, available: true },
  { href: '/admin/outbox', label: 'File de sortie', icon: Inbox, available: true },
  { href: '/admin/email-queue', label: 'File emails', icon: Mail, available: true },
  { href: '/admin/rate-limits', label: 'Limites de débit', icon: Gauge, available: true },
  { href: '/admin/pricing', label: 'Tarifs', icon: Tag, available: true },
];
