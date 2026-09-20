// Masks an email's local part for display in admin support-ticket views
// (PRD §18 "masquage par défaut des données sensibles"). Never used for
// comparison/lookup — only for what an admin sees before an explicit
// reveal (POST /api/admin/support-tickets/[id]/reveal).
import 'server-only';

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}
