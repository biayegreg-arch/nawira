import {
  BarChart2,
  Calendar,
  Cpu,
  MessageCircle,
  Shield,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { LandingAppMockup } from './LandingAppMockup';

interface Feature {
  icon: LucideIcon;
  label: string;
  desc: string;
  iconClass: string;
  bgClass: string;
}

const features: Feature[] = [
  {
    icon: Calendar,
    label: 'Calendrier intelligent',
    desc: 'Anticipe tes règles, ovulation et périodes fertiles',
    iconClass: 'text-primary',
    bgClass: 'bg-primary-soft',
  },
  {
    icon: BarChart2,
    label: 'Analyses personnalisées',
    desc: 'Comprends tes tendances et ton bien-être',
    iconClass: 'text-rose',
    bgClass: 'bg-rose-soft',
  },
  {
    icon: MessageCircle,
    label: 'Conseils adaptés',
    desc: 'Recommandations basées sur tes données',
    iconClass: 'text-green',
    bgClass: 'bg-green-soft',
  },
  {
    icon: Cpu,
    label: 'Assistant NAWIRA',
    desc: 'Réponses fiables à tes questions',
    iconClass: 'text-purple',
    bgClass: 'bg-purple-soft',
  },
  {
    icon: Shield,
    label: 'Confidentialité',
    desc: "Tes données t'appartiennent toujours",
    iconClass: 'text-amber',
    bgClass: 'bg-amber-soft',
  },
  {
    icon: Smartphone,
    label: 'Accessible partout',
    desc: 'Sur tous tes appareils, sans installation',
    iconClass: 'text-rose',
    bgClass: 'bg-rose-soft',
  },
];

export function LandingFeatures(): React.JSX.Element {
  return (
    <section
      id="fonctionnalites"
      className="w-full bg-surface px-4 py-14 sm:px-6 lg:px-12 lg:py-20"
    >
      <div className="mx-auto max-w-screen-xl">
        <div className="mb-10 flex flex-col gap-8 lg:mb-16 lg:flex-row lg:items-start lg:gap-16">
          <div className="max-w-sm flex-shrink-0">
            <h2 className="mb-4 font-headings text-2xl font-bold leading-tight text-navy md:text-3xl lg:text-4xl">
              Des outils puissants pour une vie plus sereine
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
              NAWIRA combine technologie et expertise pour t&rsquo;offrir une expérience simple,
              claire et adaptée à tes besoins.
            </p>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.label} className="flex flex-col gap-2">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${f.bgClass}`}
                >
                  <f.icon size={18} className={f.iconClass} />
                </div>
                <div className="text-sm font-semibold text-navy">{f.label}</div>
                <div className="text-xs leading-snug text-muted-foreground md:text-sm">
                  {f.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        <LandingAppMockup />
      </div>
    </section>
  );
}
