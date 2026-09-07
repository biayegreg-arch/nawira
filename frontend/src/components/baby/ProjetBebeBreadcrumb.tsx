import Link from 'next/link';

interface ProjetBebeBreadcrumbProps {
  current: string;
}

export function ProjetBebeBreadcrumb({ current }: ProjetBebeBreadcrumbProps): React.JSX.Element {
  return (
    <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
      <Link href="/app/baby" className="font-medium text-primary">
        Projet Bébé
      </Link>
      <span>/</span>
      <span className="font-medium text-navy">{current}</span>
    </div>
  );
}
