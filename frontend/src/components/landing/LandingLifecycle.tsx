import { Droplet, Flower2, Heart, type LucideIcon, Users, Baby } from 'lucide-react';

interface Stage {
  icon: LucideIcon;
  label: string;
  desc: string;
  iconClass: string;
  bgClass: string;
}

const stages: Stage[] = [
  {
    icon: Droplet,
    label: 'Cycle',
    desc: 'Suis ton cycle en toute simplicité',
    iconClass: 'text-rose',
    bgClass: 'bg-rose-soft',
  },
  {
    icon: Heart,
    label: 'Projet Bébé',
    desc: 'Augmente tes chances naturellement',
    iconClass: 'text-green',
    bgClass: 'bg-green-soft',
  },
  {
    icon: Baby,
    label: 'Grossesse',
    desc: 'Un accompagnement en toute confiance',
    iconClass: 'text-rose',
    bgClass: 'bg-rose-soft',
  },
  {
    icon: Users,
    label: 'Post-partum',
    desc: "Prends soin de toi après l'accouchement",
    iconClass: 'text-amber',
    bgClass: 'bg-amber-soft',
  },
  {
    icon: Flower2,
    label: 'Ménopause',
    desc: 'Aborde cette nouvelle étape sereinement',
    iconClass: 'text-purple',
    bgClass: 'bg-purple-soft',
  },
];

export function LandingLifecycle(): React.JSX.Element {
  return (
    <section
      id="pourquoi"
      className="w-full border-y border-border bg-white px-4 py-12 sm:px-6 lg:px-12"
    >
      <div className="mx-auto max-w-screen-xl">
        <p className="mb-8 text-center font-headings text-lg italic text-primary lg:hidden">
          À chaque étape, NAWIRA est là.
        </p>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:flex lg:items-start lg:justify-between lg:gap-8">
          {stages.map((stage) => (
            <div key={stage.label} className="flex flex-1 flex-col items-center gap-3 text-center">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-full ${stage.bgClass}`}
              >
                <stage.icon className={`h-6 w-6 ${stage.iconClass}`} />
              </div>
              <div>
                <div className="text-sm font-semibold text-navy">{stage.label}</div>
                <div className="mt-1 text-xs leading-snug text-muted-foreground">{stage.desc}</div>
              </div>
            </div>
          ))}

          <div className="hidden max-w-40 flex-shrink-0 self-center text-right font-headings text-lg italic text-primary lg:block">
            À chaque étape, NAWIRA est là.
          </div>
        </div>
      </div>
    </section>
  );
}
