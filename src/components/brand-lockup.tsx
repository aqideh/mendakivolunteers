import Image from "next/image";
import Link from "next/link";

type BrandLockupProps = Readonly<{
  href: string;
  priority?: boolean;
}>;

export function BrandLockup({ href, priority = false }: BrandLockupProps) {
  return (
    <Link className="brand-lockup" href={href} aria-label="KELUARGA — Volunteer for Impact!">
      <Image
        className="brand-logo"
        src="/brand/yayasan-mendaki.webp"
        width={1000}
        height={700}
        alt=""
        priority={priority}
        unoptimized
      />
      <span className="brand-copy">
        <span className="brand-name">KELUARGA</span>
        <span className="brand-title">Volunteer for Impact!</span>
      </span>
    </Link>
  );
}
