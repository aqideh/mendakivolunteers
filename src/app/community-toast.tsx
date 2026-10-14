"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";

import styles from "./community-toast.module.css";

export type CommunityToastProps = Readonly<{
  message: string;
  cta: string;
  href: string;
  storageKey: string;
}>;

const DISPLAY_DELAY_MS = 2_500;
const DISMISSAL_DURATION_MS = 3 * 24 * 60 * 60 * 1_000;

export default function CommunityToast({
  message,
  cta,
  href,
  storageKey,
}: CommunityToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissedUntil = Number(window.localStorage.getItem(storageKey));
      if (dismissedUntil > Date.now()) return;
    } catch {
      // A blocked localStorage must not prevent the notice from appearing.
    }

    const timer = window.setTimeout(() => setVisible(true), DISPLAY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(
        storageKey,
        String(Date.now() + DISMISSAL_DURATION_MS),
      );
    } catch {
      // Dismiss for this page view even when storage cannot be written.
    }
    track("community_toast_dismiss");
  }

  return (
    <>
      <aside className={styles.notice} aria-label="Community volunteering opportunities">
        <span className={styles.dot} aria-hidden="true" />
        <div className={styles.body}>
          <p className={styles.message}>{message}</p>
          <Link
            href={href}
            className={styles.link}
            onClick={() => track("community_toast_click")}
          >
            {cta}
          </Link>
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label="Dismiss community volunteering notice"
          onClick={dismiss}
        >
          <span aria-hidden="true">×</span>
        </button>
      </aside>
      <div className={styles.spacer} aria-hidden="true" />
    </>
  );
}
