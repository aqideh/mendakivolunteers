"use client";

import { useState } from "react";

import styles from "./website-analytics.module.css";

export function CopyManagementSummary({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className={styles.secondaryButton} onClick={copy} type="button">
      {copied ? "Copied" : "Copy management summary"}
    </button>
  );
}
