import Link from 'next/link';

interface ProjetBebeBreadcrumbProps {
  current: string;
}

export function ProjetBebeBreadcrumb({ current }: ProjetBebeBreadcrumbProps): React.JSX.Element {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      <Link href="/app/baby" className="inline-flex min-h-11 items-center font-medium text-primary">
        Projet Bébé
      </Link>
      <span>/</span>
      <span className="min-w-0 break-words font-medium text-navy">{current}</span>
    </div>
  );
}
