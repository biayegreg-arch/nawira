// Illustrative preview of the real /app/today dashboard — copy, nav items,
// prediction labels and mood options are drawn verbatim from the shipped
// components (AppSidebar.tsx, PredictionCards.tsx, MoodSelector.tsx,
// CycleRing.tsx), not a live screenshot (avoids going stale + no real user
// data). Re-added now that the real dashboard exists — dropped in the
// original landing-page pass for lacking a real page to reference.

const SIDEBAR_ITEMS = [
  "Aujourd'hui",
  'Calendrier',
  'Analyses',
  'Projet Bébé',
  'Assistant NAWIRA',
  'Profil',
];

const MOOD_EMOJIS = ['😄', '🙂', '😕', '😟', '😢'];

export function LandingAppMockup(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-end lg:justify-center">
      {/* Mobile mockup */}
      <div className="w-64 flex-shrink-0 overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="bg-primary p-4">
          <div className="mb-1 text-xs font-bold text-white">NAWIRA</div>
          <div className="text-xs text-white/80">Bonjour Aminata 👋</div>
        </div>
        <div className="space-y-2 p-3">
          <div className="text-center py-4">
            <div className="mx-auto flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 border-primary bg-primary-faint">
              <div className="text-lg font-bold text-primary">18</div>
              <div className="text-xs text-muted-light">Jour</div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">sur ~29 jours</div>
          </div>
          <div className="rounded-lg bg-green-soft p-2">
            <div className="text-xs font-semibold text-green">Fenêtre fertile</div>
            <div className="mt-0.5 text-xs text-muted-foreground">En cours</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border p-2 text-center text-xs font-medium text-navy">
              Mon cycle
            </div>
            <div className="rounded-lg border border-border p-2 text-center text-xs font-medium text-navy">
              Projet Bébé
            </div>
          </div>
        </div>
      </div>

      {/* Desktop mockup */}
      <div className="w-full max-w-2xl flex-1 overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-gray-50 px-4 py-2">
          <div className="h-3 w-3 rounded-full bg-rose" />
          <div className="h-3 w-3 rounded-full bg-amber" />
          <div className="h-3 w-3 rounded-full bg-green" />
          <div className="mx-4 flex-1 rounded bg-gray-100 px-3 py-1 text-xs text-muted-foreground">
            nawira.app
          </div>
        </div>
        <div className="flex">
          <div className="hidden w-40 flex-col gap-1 bg-primary p-3 sm:flex">
            <div className="mb-2 text-sm font-bold text-white">NAWIRA</div>
            {SIDEBAR_ITEMS.map((item) => (
              <div key={item} className="rounded px-2 py-1.5 text-xs text-white/70">
                {item}
              </div>
            ))}
          </div>
          <div className="flex-1 space-y-3 p-4">
            <div className="text-sm font-bold text-navy">Bonjour Aminata 👋</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-green-soft p-3">
                <div className="text-xs font-semibold text-green">Fenêtre fertile</div>
                <div className="mt-1 text-xs text-muted-foreground">En cours</div>
              </div>
              <div className="rounded-lg bg-rose-soft p-3">
                <div className="text-xs font-semibold text-rose">Prochaines règles</div>
                <div className="mt-1 text-xs text-muted-foreground">≈ 2 jours</div>
              </div>
              <div className="rounded-lg bg-amber-soft p-3">
                <div className="text-xs font-semibold text-amber">Ovulation estimée</div>
                <div className="mt-1 text-xs text-muted-foreground">≈ 8 jours</div>
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 text-xs font-semibold text-navy">
                Comment te sens-tu aujourd&rsquo;hui ?
              </div>
              <div className="flex gap-3">
                {MOOD_EMOJIS.map((emoji, i) => (
                  <div key={i} className="text-center text-xl">
                    {emoji}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
