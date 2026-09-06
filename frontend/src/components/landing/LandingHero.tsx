import { CheckCircle, Heart, Lock } from 'lucide-react';
import { LinkButton } from '@/components/ui/Button';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=1200&q=80';

export function LandingHero(): React.JSX.Element {
  return (
    <section className="relative w-full overflow-hidden bg-surface">
      <div className="mx-auto flex max-w-screen-xl flex-col gap-8 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:gap-16 lg:px-12 lg:py-20">
        {/* Text content */}
        <div className="max-w-lg">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">
            La santé féminine plus simple au quotidien
          </p>

          <h1 className="mb-3 font-headings text-4xl font-bold leading-tight text-navy sm:text-5xl">
            Comprends <em className="italic">ton corps.</em>
          </h1>
          <h2 className="mb-6 font-headings text-3xl font-bold italic leading-tight text-primary sm:text-4xl">
            Vis ta vie sereinement.
          </h2>

          <p className="mb-8 max-w-md text-base leading-relaxed text-body">
            NAWIRA t&rsquo;accompagne à chaque étape de ta vie : cycle menstruel, projet bébé,
            grossesse, post-partum et ménopause. Des informations fiables, des outils simples et un
            accompagnement bienveillant, pensés pour les femmes africaines.
          </p>

          <div className="mb-8">
            <LinkButton href="/signup" variant="primary" size="lg" className="w-full sm:w-auto">
              Commencer gratuitement
            </LinkButton>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle className="h-3.5 w-3.5 text-primary" />
              Aucune carte bancaire requise
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5 text-primary" />
              Tes données sont sécurisées
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Heart className="h-3.5 w-3.5 text-rose" />
              Pensé pour les femmes africaines
            </div>
          </div>
        </div>

        {/* Hero image */}
        <div className="relative -mx-4 aspect-[4/3] overflow-hidden sm:mx-0 sm:rounded-2xl lg:flex-1">
          <img
            src={HERO_IMAGE}
            alt="Femme africaine souriante, confiante"
            className="h-full w-full object-cover object-top"
          />
        </div>
      </div>
    </section>
  );
}
