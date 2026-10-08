"use client";

import { usePathname } from "next/navigation";

export function SkipToContent() {
  const pathname = usePathname();

  function skip() {
    const main = document.querySelector("main");
    if (!(main instanceof HTMLElement)) return;
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    main.focus({ preventScroll: true });
    main.scrollIntoView({ block: "start" });
  }

  return (
    <a className="skip-to-content" href="#main-content" key={pathname} onClick={skip}>
      Skip to main content
    </a>
  );
}
