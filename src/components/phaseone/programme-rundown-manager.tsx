"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  deleteProgrammeRundownImage,
  moveProgrammeRundownImage,
  registerProgrammeRundownImage,
  requestProgrammeRundownUpload,
} from "@/app/admin/events/programme-rundown-actions";
import {
  isProgrammeRundownMimeType,
  programmeRundownBucket,
  programmeRundownMaxFileSize,
  programmeRundownMaxFilesPerSelection,
  programmeRundownMaxImagesPerEvent,
} from "@/lib/phaseone/programme-rundown";
import { createClient } from "@/lib/supabase/client";

import styles from "./programme-rundown-manager.module.css";

type RundownImage = Readonly<{
  id: string;
  url: string;
  fileName: string | null;
}>;

export function ProgrammeRundownManager({
  eventId,
  images,
  legacyUrl,
}: {
  eventId: string;
  images: readonly RundownImage[];
  legacyUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const atCapacity = images.length >= programmeRundownMaxImagesPerEvent;

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setMessage(null);

    const selected = Array.from(files);
    if (selected.length > programmeRundownMaxFilesPerSelection) {
      setMessage(`Upload at most ${programmeRundownMaxFilesPerSelection} images at a time.`);
      return;
    }
    if (images.length + selected.length > programmeRundownMaxImagesPerEvent) {
      setMessage(`An event can have at most ${programmeRundownMaxImagesPerEvent} rundown images.`);
      return;
    }

    const invalid = selected.find(
      (file) =>
        !isProgrammeRundownMimeType(file.type) ||
        file.size <= 0 ||
        file.size > programmeRundownMaxFileSize,
    );
    if (invalid) {
      setMessage("Use JPEG, PNG or WebP images up to 5 MB each.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      for (const file of selected) {
        const upload = await requestProgrammeRundownUpload({
          eventId,
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        });
        const { error } = await supabase.storage
          .from(programmeRundownBucket)
          .uploadToSignedUrl(upload.storagePath, upload.token, file, {
            contentType: file.type,
          });
        if (error) throw new Error(`Could not upload ${file.name}.`);
        await registerProgrammeRundownImage({
          eventId,
          storagePath: upload.storagePath,
          fileName: upload.fileName,
        });
      }
      setMessage(selected.length === 1 ? "Image uploaded." : `${selected.length} images uploaded.`);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Programme rundown upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function mutate(action: () => Promise<void>) {
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Programme rundown could not be updated.");
      }
    });
  }

  return (
    <div className={styles.manager}>
      <div className="form-field">
        <label htmlFor="programmeRundownImages">Programme rundown images</label>
        <input
          accept="image/jpeg,image/png,image/webp"
          className={styles.fileInput}
          disabled={uploading || isPending || atCapacity}
          id="programmeRundownImages"
          multiple
          onChange={(event) => void uploadFiles(event.currentTarget.files)}
          ref={inputRef}
          type="file"
        />
        <div className={styles.uploadRow}>
          <button
            className="button button-primary"
            disabled={uploading || isPending || atCapacity}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {uploading ? "Uploading…" : "Upload images"}
          </button>
          <span className="muted">
            {images.length}/{programmeRundownMaxImagesPerEvent} images
          </span>
        </div>
        <p className="muted">
          Upload JPEG, PNG or WebP images up to 5 MB each. You can select up to {programmeRundownMaxFilesPerSelection} at a time.
        </p>
      </div>

      {message ? <p className={styles.status} role="status">{message}</p> : null}

      {images.length > 0 ? (
        <ol className={styles.grid}>
          {images.map((image, index) => (
            <li className={styles.imageCard} key={image.id}>
              <div className={styles.preview}>
                <Image
                  alt={`Programme rundown page ${index + 1}`}
                  fill
                  sizes="(max-width: 720px) 45vw, 220px"
                  src={image.url}
                />
              </div>
              <div className={styles.meta}>
                <strong>Page {index + 1}</strong>
                <span>{image.fileName ?? "Uploaded image"}</span>
              </div>
              <div className={styles.actions}>
                <button
                  className="button button-secondary"
                  disabled={index === 0 || isPending || uploading}
                  onClick={() => mutate(() => moveProgrammeRundownImage(image.id, "up"))}
                  type="button"
                >
                  Move up
                </button>
                <button
                  className="button button-secondary"
                  disabled={index === images.length - 1 || isPending || uploading}
                  onClick={() => mutate(() => moveProgrammeRundownImage(image.id, "down"))}
                  type="button"
                >
                  Move down
                </button>
                <button
                  className="button button-secondary"
                  disabled={isPending || uploading}
                  onClick={() => mutate(() => deleteProgrammeRundownImage(image.id))}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No uploaded rundown images yet.</p>
      )}

      {legacyUrl && images.length === 0 ? (
        <p className="muted">
          This event still has its earlier external rundown URL. It will remain available to volunteers until you upload the first image.
        </p>
      ) : null}
    </div>
  );
}
