import Image from "next/image";
import Link from "next/link";

type BrandLockupProps = Readonly<{
  href: string;
  priority?: boolean;
}>;

export function BrandLockup({ href, priority = false }: BrandLockupProps) {
  return (
    <Link className="brand-lockup" href={href}>
      <Image
        className="brand-logo"
        src="/brand/rela-header.webp"
        width={104}
        height={40}
        alt="RELA!"
        priority={priority}
      />
      <span className="brand-title">MENDAKI Volunteer App</span>
    </Link>
  );
}
