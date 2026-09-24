"use client";

import { useRef, useState, useTransition } from "react";

import {
  attachProfilePhoto,
  removeProfilePhoto,
  requestProfilePhotoUpload,
} from "@/app/dashboard/profile-photo-actions";
import { processImageForUpload } from "@/lib/media/image-processing";
import {
  profilePhotoBucket,
  profilePhotoMaxBytes,
} from "@/lib/media/storage";
import { createClient } from "@/lib/supabase/client";

import styles from "./photo-uploader.module.css";

export function ProfilePhotoUploader({
  displayName,
  imageUrl,
}: {
  displayName: string;
  imageUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  async function upload(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    setUploading(true);

    try {
      const processed = await processImageForUpload(file, {
        width: 512,
        height: 512,
        maxBytes: profilePhotoMaxBytes,
      });
      const signed = await requestProfilePhotoUpload({
        contentType: processed.type,
        fileSize: processed.size,
      });

      const supabase = createClient();
      const { error } = await supabase.storage
        .from(profilePhotoBucket)
        .uploadToSignedUrl(signed.storagePath, signed.token, processed, {
          contentType: processed.type,
        });

      if (error) throw new Error("The profile photo could not be uploaded.");

      await attachProfilePhoto(signed.storagePath);
      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Profile photo upload failed.",
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
        await removeProfilePhoto();
        window.location.reload();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Profile photo could not be removed.",
        );
      }
    });
  }

  return (
    <div className={styles.profilePhoto}>
      <div
        className={styles.avatar}
        aria-label={
          imageUrl
            ? `${displayName} profile photo`
            : `${displayName} initials`
        }
      >
        {imageUrl ? <img alt="" src={imageUrl} /> : <span>{initials || "V"}</span>}
      </div>
      <div className={styles.controls}>
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
            {uploading ? "Preparing photo…" : imageUrl ? "Change photo" : "Add photo"}
          </button>
          {imageUrl ? (
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
          Images are cropped to a square, resized to 512 × 512 and converted to WebP
          before upload.
        </p>
        {message ? (
          <p className={styles.status} role="status">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
