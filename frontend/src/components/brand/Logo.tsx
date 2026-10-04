import Image from 'next/image';

interface LogoProps {
  /** Rendered width/height in pixels (the source is square). */
  size?: number;
  className?: string;
}

/**
 * The NAWIRA brand mark (leaf + figure), transparent background. Used
 * everywhere the logo appears: landing nav/footer, auth card, onboarding
 * welcome, app/admin sidebar headers. Transparent so it sits cleanly on
 * both light pages and the colored sidebar gradients, with no background
 * chip needed.
 */
export function Logo({ size = 32, className = '' }: LogoProps): React.JSX.Element {
  return (
    <Image
      src="/images/logo-icon.png"
      alt="NAWIRA"
      width={size}
      height={size}
      className={`flex-shrink-0 ${className}`}
    />
  );
}
