import Image from 'next/image';

interface LogoProps {
  /** Rendered width/height in pixels (the source is square). */
  size?: number;
  className?: string;
}

/**
 * The NAWIRA app-icon mark (leaf + figure, in its own rounded square). Used
 * everywhere the brand badge appears: landing nav/footer, auth card,
 * onboarding welcome. The source already includes its background and
 * rounding, so it renders directly — no extra circle/badge wrapper needed.
 */
export function Logo({ size = 32, className = '' }: LogoProps): React.JSX.Element {
  return (
    <Image
      src="/images/logo-icon.png"
      alt="NAWIRA"
      width={size}
      height={size}
      className={`flex-shrink-0 rounded-xl ${className}`}
    />
  );
}
