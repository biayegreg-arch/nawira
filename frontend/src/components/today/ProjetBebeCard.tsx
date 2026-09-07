import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function ProjetBebeCard(): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-green-soft p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-base">🌿</span>
        <span className="text-sm font-bold text-green">Projet Bébé</span>
      </div>
      <div className="mb-2 text-base leading-snug font-bold text-navy">Tu penses à un bébé ?</div>
      <p className="mb-4 text-xs leading-relaxed text-body">
        NAWIRA t&rsquo;accompagne avec un suivi de ta fenêtre fertile et des conseils pour ton
        projet de conception.
      </p>
      <Link
        href="/app/baby"
        className="flex w-fit items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white"
      >
        Découvrir Projet Bébé <ArrowRight size={14} />
      </Link>
    </div>
  );
}
