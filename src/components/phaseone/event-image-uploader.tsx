"use client";

import { useRef, useState, useTransition } from "react";

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
}: {
  eventId: string;
  imageUrl: string | null;
  onImageChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentUrl, setCurrentUrl] = useState(imageUrl);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function upload(file: File | undefined) {
    if (!file) return;
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

  function remove() {
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
    <div className={styles.eventImage}>
      <div className={styles.eventPreview}>
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUrl} alt="" />
        ) : (
          <span className={styles.eventPlaceholder}>No opportunity image</span>
        )}
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
            disabled={uploading || isPending}
            onClick={remove}
          >
            Remove
          </button>
        ) : null}
      </div>
      <p className="form-help">
        Images are centre-cropped to 16:9, resized to 1600 × 900 and converted to
        WebP before upload.
      </p>
      {message ? (
        <p className={styles.status} role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
