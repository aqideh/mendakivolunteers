import Image from "next/image";
import Link from "next/link";

type BrandLockupProps = Readonly<{
  href: string;
  priority?: boolean;
}>;

export function BrandLockup({ href, priority = false }: BrandLockupProps) {
  return (
    <Link className="brand-lockup" href={href} aria-label="KELUARGA — MENDAKI Volunteer App">
      <Image
        className="brand-logo"
        src="/brand/keluarga-mark.svg"
        width={48}
        height={48}
        alt=""
        priority={priority}
        unoptimized
      />
      <span className="brand-copy">
        <span className="brand-name">KELUARGA</span>
        <span className="brand-title">MENDAKI Volunteer App</span>
      </span>
    </Link>
  );
}
