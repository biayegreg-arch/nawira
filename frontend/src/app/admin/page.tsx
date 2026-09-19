'use client';

import { useAdmin } from '@/contexts/AdminContext';
import { ADMIN_NAV } from '@/components/admin/admin-nav';
import { SectionLinkCard } from '@/components/admin/SectionLinkCard';
import { Badge } from '@/components/ui/Badge';

const SECTION_DESCRIPTIONS: Record<string, string> = {
  '/admin/users': 'Rechercher, consulter et gérer les comptes',
  '/admin/orders': 'Historique des commandes et paiements',
  '/admin/withdrawals': 'Retraits en attente et traités',
  '/admin/audit-log': 'Historique des actions d’administration',
  '/admin/outbox': 'File des effets de bord (emails, notifications)',
  '/admin/email-queue': 'File d’envoi des emails transactionnels',
  '/admin/rate-limits': 'État des limites de débit par compartiment',
};

export default function AdminOverviewPage(): React.JSX.Element {
  const admin = useAdmin();
  const sections = ADMIN_NAV.filter((item) => item.href !== '/admin');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Connecté en tant que <span className="font-medium text-navy">{admin.email}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={admin.role === 'SUPERADMIN' ? 'warning' : 'primary'}>{admin.role}</Badge>
          {admin.can.map((capability) => (
            <Badge key={capability} tone="neutral">
              {capability}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((item) => (
          <SectionLinkCard
            key={item.href}
            href={item.href}
            label={item.label}
            description={SECTION_DESCRIPTIONS[item.href] ?? ''}
            icon={item.icon}
            available={item.available}
          />
        ))}
      </div>
    </div>
  );
}
