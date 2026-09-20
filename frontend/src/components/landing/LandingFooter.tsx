import { Activity } from 'lucide-react';

const linkGroups: Record<string, Array<{ label: string; href: string }>> = {
  Produit: [
    { label: 'Fonctionnalités', href: '#fonctionnalites' },
    { label: 'Pourquoi NAWIRA ?', href: '#pourquoi' },
    { label: 'Avis', href: '#avis' },
  ],
  Ressources: [{ label: "Centre d'aide", href: '/app/help' }],
};

export function LandingFooter(): React.JSX.Element {
  return (
    <footer className="w-full border-t border-border">
      <div className="mx-auto max-w-screen-xl px-4 py-10 sm:px-6 lg:px-12 lg:py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:flex-wrap sm:gap-16">
          {/* Brand */}
          <div className="max-w-xs flex-shrink-0">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary">
                <Activity className="h-3.5 w-3.5 text-white" />
              </span>
              <span className="font-headings text-lg font-bold text-navy">NAWIRA</span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Comprends ton corps. Vis ta vie sereinement.
            </p>
          </div>

          {/* Links */}
          {Object.entries(linkGroups).map(([category, items]) => (
            <div key={category} className="flex-1">
              <h4 className="mb-4 text-sm font-semibold text-navy">{category}</h4>
              <ul>
                {items.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="inline-flex min-h-11 min-w-11 items-center text-sm text-muted-foreground"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-screen-xl flex-col items-center gap-2 px-4 py-4 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left lg:px-12">
          <p className="text-xs text-muted-light">© 2026 NAWIRA. Tous droits réservés.</p>
          <p className="text-xs text-muted-light">Une vie plus saine pour toutes les femmes.</p>
        </div>
      </div>
    </footer>
  );
}
