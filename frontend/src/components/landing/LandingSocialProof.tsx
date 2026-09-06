import { Lock, ShieldCheck, Sparkles } from 'lucide-react';

const IMAGE =
  'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=1600&q=80';

const points = [
  { icon: Sparkles, text: 'Conçu avec des professionnel·les de santé' },
  { icon: Lock, text: 'Tes données ne sont jamais vendues' },
  { icon: ShieldCheck, text: 'Export et suppression de tes données à tout moment' },
];

export function LandingSocialProof(): React.JSX.Element {
  return (
    <section id="avis" className="relative w-full overflow-hidden">
      <div className="absolute inset-0">
        <img src={IMAGE} alt="" aria-hidden className="h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-[rgba(30,20,60,0.78)]" />
      </div>

      <div className="relative mx-auto max-w-screen-xl px-4 py-14 sm:px-6 lg:flex lg:items-center lg:gap-16 lg:px-12 lg:py-20">
        <div className="max-w-xs">
          <h2 className="font-headings text-3xl font-bold leading-tight text-white lg:text-4xl">
            Plus qu&rsquo;une application.
            <br />
            Une alliée pour ta vie.
          </h2>
          <div className="mt-4 h-1 w-12 rounded-full bg-rose" />
        </div>

        <div className="mt-8 flex-1 space-y-3 lg:mt-0">
          {points.map((p) => (
            <div
              key={p.text}
              className="flex items-center gap-3 rounded-xl p-4 backdrop-blur-sm"
              style={{ background: 'rgba(255, 255, 255, 0.12)' }}
            >
              <p.icon className="h-5 w-5 flex-shrink-0 text-primary-light" />
              <p className="text-sm text-white">{p.text}</p>
            </div>
          ))}
          <p className="pt-2 text-xs text-white/70">
            NAWIRA est un tout nouveau produit, pensé et lancé au Sénégal — rejoins les premières
            utilisatrices.
          </p>
        </div>
      </div>
    </section>
  );
}
