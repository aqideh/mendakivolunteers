"use client";

import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import {
  attachLandingPageImage,
  requestLandingPageImageUpload,
  resetLandingPageImage,
} from "@/app/admin/content/landing-pages/actions";
import type { LandingPageKey } from "@/lib/content/landing-page-media";
import {
  landingPageImageBucket,
  landingPageImageMaxBytes,
  landingPageImageMimeTypes,
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
  const dragDepthRef = useRef(0);
  const [currentUrl, setCurrentUrl] = useState(item.imageUrl);
  const [isCustom, setIsCustom] = useState(item.isCustom);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = uploading || isPending;

  async function upload(file: File | undefined) {
    if (!file || isBusy) return;

    setUploading(true);
    setMessage(null);

    try {
      if (!(landingPageImageMimeTypes as readonly string[]).includes(file.type)) {
        throw new Error("Use a JPEG, PNG or WebP image.");
      }
      if (file.size <= 0 || file.size > landingPageImageMaxBytes) {
        throw new Error("Choose an image up to 20 MB.");
      }

      const signed = await requestLandingPageImageUpload({
        pageKey: item.key,
        contentType: file.type,
        fileSize: file.size,
      });

      const supabase = createClient();
      const { error } = await supabase.storage
        .from(landingPageImageBucket)
        .uploadToSignedUrl(signed.storagePath, signed.token, file, {
          contentType: file.type,
        });

      if (error) throw new Error("The landing page photo could not be uploaded.");

      const result = await attachLandingPageImage({
        pageKey: item.key,
        storagePath: signed.storagePath,
      });

      setCurrentUrl(result.publicUrl);
      setIsCustom(true);
      setMessage("Photo updated at original resolution.");
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
    if (isBusy) return;

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

  function openFilePicker() {
    if (!isBusy) inputRef.current?.click();
  }

  function onDropZoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openFilePicker();
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (isBusy) return;

    dragDepthRef.current += 1;
    setIsDragging(true);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (isBusy) return;

    event.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (isBusy) return;

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current = 0;
    setIsDragging(false);

    if (isBusy) return;
    void upload(event.dataTransfer.files?.[0]);
  }

  return (
    <article className={styles.card}>
      <div
        aria-busy={isBusy}
        aria-disabled={isBusy}
        aria-label={`Upload a photo for ${item.label}. Drag and drop a JPEG, PNG or WebP image here, or press Enter to browse.`}
        className={`${styles.preview} ${isDragging ? styles.previewDragging : ""}`}
        onClick={openFilePicker}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onKeyDown={onDropZoneKeyDown}
        role="button"
        tabIndex={isBusy ? -1 : 0}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={currentUrl} alt="" />
        <span className={styles.previewShade} aria-hidden="true" />
        <span className={styles.statusBadge}>
          {isCustom ? "Custom photo" : "Default photo"}
        </span>
        <span className={styles.dropPrompt}>
          <strong>{isDragging ? "Drop photo to upload" : "Drag & drop photo here"}</strong>
          <span>{uploading ? "Uploading…" : "or click to browse"}</span>
        </span>
      </div>

      <div className={styles.cardBody}>
        <div>
          <h2>{item.label}</h2>
          <a className="text-link" href={item.href} target="_blank" rel="noreferrer">
            View page ↗
          </a>
        </div>

        <input
          ref={inputRef}
          className={styles.hiddenInput}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={(event) => void upload(event.currentTarget.files?.[0])}
        />

        <div className={styles.actions}>
          <button
            className="button button-secondary"
            type="button"
            disabled={isBusy}
            onClick={openFilePicker}
          >
            {uploading ? "Uploading…" : isCustom ? "Replace photo" : "Upload photo"}
          </button>

          {isCustom ? (
            <button
              className="text-link button-reset"
              type="button"
              disabled={isBusy}
              onClick={reset}
            >
              Reset to default
            </button>
          ) : null}
        </div>

        {message ? <p className={styles.message} role="status">{message}</p> : null}
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
      {pages.map((item) => <LandingPagePhotoCard item={item} key={item.key} />)}
    </div>
  );
}
