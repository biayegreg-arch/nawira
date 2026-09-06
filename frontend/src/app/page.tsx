import { LandingNav } from '@/components/landing/LandingNav';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingLifecycle } from '@/components/landing/LandingLifecycle';
import { LandingFeatures } from '@/components/landing/LandingFeatures';
import { LandingSocialProof } from '@/components/landing/LandingSocialProof';
import { LandingCTA } from '@/components/landing/LandingCTA';
import { LandingFooter } from '@/components/landing/LandingFooter';

export const runtime = 'nodejs';

export default function Home(): React.JSX.Element {
  return (
    <main className="w-full bg-background font-body">
      <LandingNav />
      <LandingHero />
      <LandingLifecycle />
      <LandingFeatures />
      <LandingSocialProof />
      <LandingCTA />
      <LandingFooter />
    </main>
  );
}
