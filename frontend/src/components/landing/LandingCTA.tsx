import { ArrowRight, Heart, Lock, Zap, type LucideIcon } from 'lucide-react';
import { LinkButton } from '@/components/ui/Button';

interface ValueProp {
  icon: LucideIcon;
  label: string;
  desc: string;
  iconClass: string;
  bgClass: string;
}

const valueProps: ValueProp[] = [
  {
    icon: Zap,
    label: 'Simple',
    desc: 'À utiliser',
    iconClass: 'text-primary',
    bgClass: 'bg-primary-soft',
  },
  {
    icon: Lock,
    label: 'Sûre',
    desc: 'Tes données sont protégées',
    iconClass: 'text-green',
    bgClass: 'bg-green-soft',
  },
  {
    icon: Heart,
    label: 'Pour toi',
    desc: 'Pensée pour les femmes africaines',
    iconClass: 'text-rose',
    bgClass: 'bg-rose-soft',
  },
];

export function LandingCTA(): React.JSX.Element {
  return (
    <section className="w-full bg-white px-4 py-14 sm:px-6 lg:px-12 lg:py-20">
      <div className="mx-auto flex max-w-screen-xl flex-col gap-10 lg:flex-row lg:items-center lg:gap-24">
        <div className="max-w-md min-w-0">
          <h2 className="mb-4 font-headings text-2xl font-bold leading-tight text-navy md:text-3xl lg:text-4xl">
            Prête à reprendre le contrôle de ta santé ?
          </h2>
          <p className="mb-6 text-sm leading-relaxed md:mb-8 md:text-base text-muted-foreground">
            Crée ton compte gratuitement et commence à mieux comprendre ton cycle dès
            aujourd&rsquo;hui.
          </p>
          <LinkButton href="/signup" variant="primary" size="lg" className="h-12 w-full sm:w-auto">
            Commencer gratuitement
            <ArrowRight className="h-4 w-4" />
          </LinkButton>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-8 sm:grid-cols-3">
          {valueProps.map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-3 text-center">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-full ${item.bgClass}`}
              >
                <item.icon size={22} className={item.iconClass} />
              </div>
              <div>
                <div className="text-base font-bold text-navy">{item.label}</div>
                <div className="mt-1 text-sm text-muted-foreground">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
