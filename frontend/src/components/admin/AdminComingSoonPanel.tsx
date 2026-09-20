import { type LucideIcon } from 'lucide-react';

interface AdminComingSoonPanelProps {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  message: string;
  /** Extra vertical room so the placeholder fills roughly the same shell
   * height as the Banani content it replaces (chart, table, toggle list). */
  minHeight?: string;
}

// Honest placeholder for a Banani-mocked panel with no real backing data
// today (no recurring-subscription billing, no moderation/report model, no
// platform-settings model — see .planning/banani/admin.md's 2026-09-20
// delta). Deliberately non-interactive: a disabled-looking button or a fake
// toggle that does nothing on click is worse than no control at all.
export function AdminComingSoonPanel({
  icon: Icon,
  iconColor,
  iconBg,
  message,
  minHeight = '9rem',
}: AdminComingSoonPanelProps): React.JSX.Element {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center"
      style={{ minHeight }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ background: iconBg }}
      >
        <Icon className="h-[18px] w-[18px]" style={{ color: iconColor }} aria-hidden="true" />
      </div>
      <p className="max-w-xs text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
