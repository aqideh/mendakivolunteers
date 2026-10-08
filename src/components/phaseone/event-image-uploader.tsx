"use client";

import {
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import {
  attachEventImage,
  removeEventImage,
  requestEventImageUpload,
} from "@/app/admin/events/event-image-actions";
import { processImageForUpload } from "@/lib/media/image-processing";
import {
  eventImageBucket,
  eventImageMaxBytes,
} from "@/lib/media/storage";
import { createClient } from "@/lib/supabase/client";

import styles from "../photo-uploader.module.css";

export function EventImageUploader({
  eventId,
  imageUrl,
  onImageChange,
  compact = false,
}: {
  eventId: string;
  imageUrl: string | null;
  onImageChange: (url: string | null) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [currentUrl, setCurrentUrl] = useState(imageUrl);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = uploading || isPending;

  async function upload(file: File | undefined) {
    if (!file || isBusy) return;
    setMessage(null);
    setUploading(true);

    try {
      const processed = await processImageForUpload(file, {
        width: 1600,
        height: 900,
        maxBytes: eventImageMaxBytes,
      });
      const signed = await requestEventImageUpload({
        eventId,
        contentType: processed.type,
        fileSize: processed.size,
      });

      const supabase = createClient();
      const { error } = await supabase.storage
        .from(eventImageBucket)
        .uploadToSignedUrl(signed.storagePath, signed.token, processed, {
          contentType: processed.type,
        });

      if (error) throw new Error("The opportunity image could not be uploaded.");

      const result = await attachEventImage({
        eventId,
        storagePath: signed.storagePath,
      });
      setCurrentUrl(result.publicUrl);
      onImageChange(result.publicUrl);
      setMessage("Opportunity image updated.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Opportunity image upload failed.",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
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

  function remove() {
    if (isBusy) return;

    setMessage(null);
    startTransition(async () => {
      try {
        await removeEventImage(eventId);
        setCurrentUrl(null);
        onImageChange(null);
        setMessage("Opportunity image removed.");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Opportunity image could not be removed.",
        );
      }
    });
  }

  return (
    <div className={compact ? `${styles.eventImage} ${styles.eventImageCompact}` : styles.eventImage}>
      <div
        aria-busy={isBusy}
        aria-disabled={isBusy}
        aria-label="Upload an event card image. Drag and drop an image here, or press Enter to browse."
        className={`${styles.eventPreview} ${isDragging ? styles.eventPreviewDragging : ""}`}
        onClick={openFilePicker}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onKeyDown={onDropZoneKeyDown}
        role="button"
        tabIndex={isBusy ? -1 : 0}
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUrl} alt="" />
        ) : (
          <span className={styles.eventPlaceholder}>No opportunity image</span>
        )}
        <span className={styles.eventDropPrompt} aria-hidden="true">
          {isDragging
            ? "Drop image to upload"
            : uploading
              ? "Preparing image…"
              : "Drag & drop or click to upload"}
        </span>
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
          disabled={isBusy}
          onClick={openFilePicker}
        >
          {uploading
            ? "Preparing image…"
            : currentUrl
              ? "Replace image"
              : "Upload image"}
        </button>
        {currentUrl ? (
          <button
            className="text-link button-reset"
            type="button"
            disabled={isBusy}
            onClick={remove}
          >
            Remove
          </button>
        ) : null}
      </div>
      <p className="form-help">
        Drag and drop an image onto the preview, or use the upload button. Images
        are centre-cropped to 16:9, resized to 1600 × 900 and converted to WebP
        before upload.
      </p>
      {message ? (
        <p className={styles.status} role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
