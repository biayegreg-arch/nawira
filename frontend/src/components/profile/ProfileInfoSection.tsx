import type { LucideIcon } from 'lucide-react';

interface ProfileInfoSectionProps {
  icon: LucideIcon;
  iconClassName: string;
  title: string;
  children: React.ReactNode;
}

export function ProfileInfoSection({
  icon: Icon,
  iconClassName,
  title,
  children,
}: ProfileInfoSectionProps): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border bg-white p-6">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy">
        <Icon size={18} className={iconClassName} />
        {title}
      </h3>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

export function ProfileField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="rounded-md border border-border bg-gray-50 px-4 py-2.5 text-sm text-navy">
        {value}
      </div>
    </div>
  );
}
