"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  attachLandingPageImage,
  requestLandingPageImageUpload,
  resetLandingPageImage,
} from "@/app/admin/content/landing-pages/actions";
import type { LandingPageKey } from "@/lib/content/landing-page-media";
import { processImageForUpload } from "@/lib/media/image-processing";
import {
  landingPageImageBucket,
  landingPageImageMaxBytes,
} from "@/lib/media/storage";
import { createClient } from "@/lib/supabase/client";

import styles from "./landing-page-photo-manager.module.css";

export type LandingPagePhotoItem = Readonly<{
  key: LandingPageKey;
  label: string;
  href: string;
  imageUrl: string;
  isCustom: boolean;
}>;

function LandingPagePhotoCard({ item }: { item: LandingPagePhotoItem }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentUrl, setCurrentUrl] = useState(item.imageUrl);
  const [isCustom, setIsCustom] = useState(item.isCustom);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function upload(file: File | undefined) {
    if (!file) return;

    setUploading(true);
    setMessage(null);

    try {
      const processed = await processImageForUpload(file, {
        width: 1600,
        height: 900,
        maxBytes: landingPageImageMaxBytes,
      });

      const signed = await requestLandingPageImageUpload({
        pageKey: item.key,
        contentType: processed.type,
        fileSize: processed.size,
      });

      const supabase = createClient();
      const { error } = await supabase.storage
        .from(landingPageImageBucket)
        .uploadToSignedUrl(signed.storagePath, signed.token, processed, {
          contentType: processed.type,
        });

      if (error) {
        throw new Error("The landing page photo could not be uploaded.");
      }

      const result = await attachLandingPageImage({
        pageKey: item.key,
        storagePath: signed.storagePath,
      });

      setCurrentUrl(result.publicUrl);
      setIsCustom(true);
      setMessage("Photo updated.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The landing page photo could not be updated.",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function reset() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await resetLandingPageImage(item.key);
        setCurrentUrl(result.imageUrl);
        setIsCustom(false);
        setMessage("Reset to the default photo.");
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "The landing page photo could not be reset.",
        );
      }
    });
  }

  return (
    <article className={styles.card}>
      <div className={styles.preview}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={currentUrl} alt="" />
        <span className={styles.statusBadge}>
          {isCustom ? "Custom photo" : "Default photo"}
        </span>
      </div>

      <div className={styles.cardBody}>
        <div>
          <h2>{item.label}</h2>
          <a
            className="text-link"
            href={item.href}
            target="_blank"
            rel="noreferrer"
          >
            View page ↗
          </a>
        </div>

        <input
          ref={inputRef}
          className={styles.hiddenInput}
          type="file"
          accept="image/*"
          onChange={(event) => void upload(event.currentTarget.files?.[0])}
        />

        <div className={styles.actions}>
          <button
            className="button button-secondary"
            type="button"
            disabled={uploading || isPending}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Preparing photo…" : isCustom ? "Replace photo" : "Upload photo"}
          </button>

          {isCustom ? (
            <button
              className="text-link button-reset"
              type="button"
              disabled={uploading || isPending}
              onClick={reset}
            >
              Reset to default
            </button>
          ) : null}
        </div>

        {message ? (
          <p className={styles.message} role="status">
            {message}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function LandingPagePhotoManager({
  pages,
}: {
  pages: readonly LandingPagePhotoItem[];
}) {
  return (
    <div className={styles.grid}>
      {pages.map((item) => (
        <LandingPagePhotoCard item={item} key={item.key} />
      ))}
    </div>
  );
}
