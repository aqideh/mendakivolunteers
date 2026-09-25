"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_STORED_BYTES = 512 * 1024;
const AVATAR_SIZE = 512;

type ProfilePhotoUploaderProps = Readonly<{
  volunteerId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  avatarPath: string | null;
  completion: number;
}>;

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("This image could not be read. Try a JPG, PNG or WebP image."));
    };
    image.src = objectUrl;
  });
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The image could not be prepared for upload."));
      },
      "image/webp",
      quality,
    );
  });
}

async function prepareProfilePhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 0) {
    throw new Error("Choose a valid image file.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Choose an image smaller than 20 MB.");
  }

  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Your browser could not prepare this image.");

  const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - cropSize) / 2;
  const sourceY = (image.naturalHeight - cropSize) / 2;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );

  let quality = 0.84;
  let blob = await canvasToWebp(canvas, quality);
  while (blob.size > MAX_STORED_BYTES && quality > 0.5) {
    quality -= 0.08;
    blob = await canvasToWebp(canvas, quality);
  }

  if (blob.size > MAX_STORED_BYTES) {
    throw new Error("The processed image is still too large. Try a simpler photo.");
  }

  return new File([blob], "avatar.webp", {
    type: "image/webp",
    lastModified: Date.now(),
  });
}

export function ProfilePhotoUploader({
  volunteerId,
  userId,
  displayName,
  avatarUrl,
  avatarPath,
  completion,
}: ProfilePhotoUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(avatarUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const sourceFile = event.target.files?.[0];
    event.target.value = "";
    if (!sourceFile) return;

    setIsUploading(true);
    setMessage(null);

    let objectUrl: string | null = null;
    try {
      const file = await prepareProfilePhoto(sourceFile);
      const supabase = createClient() as unknown as SupabaseClient;
      const nextPath = `${userId}/avatar-${Date.now()}.webp`;
      objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);

      const { error: uploadError } = await supabase.storage
        .from("volunteer-profile-photos")
        .upload(nextPath, file, {
          cacheControl: "3600",
          contentType: "image/webp",
          upsert: false,
        });

      if (uploadError) {
        throw new Error("Photo upload failed. Try again.");
      }

      const { error: profileError } = await supabase
        .from("keluarga_volunteer_profiles")
        .upsert(
          {
            volunteer_id: volunteerId,
            avatar_path: nextPath,
          },
          { onConflict: "volunteer_id" },
        );

      if (profileError) {
        await supabase.storage.from("volunteer-profile-photos").remove([nextPath]);
        throw new Error("Photo could not be saved to your profile.");
      }

      if (avatarPath && avatarPath !== nextPath) {
        const { error: removeError } = await supabase.storage
          .from("volunteer-profile-photos")
          .remove([avatarPath]);
        if (removeError) {
          console.error("Unable to remove previous profile photo", {
            message: removeError.message,
          });
        }
      }

      setMessage("Profile photo updated.");
      router.refresh();
    } catch (error) {
      setPreviewUrl(avatarUrl);
      setMessage(error instanceof Error ? error.message : "Photo upload failed.");
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setIsUploading(false);
    }
  }

  return (
    <div className="profile-passport-photo-block">
      <button
        className="profile-passport-avatar-button"
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="Change profile photo"
        disabled={isUploading}
      >
        <span
          className="profile-passport-progress-ring"
          style={{ "--profile-completion": `${completion * 3.6}deg` } as CSSProperties}
          aria-hidden="true"
        />
        <span className="profile-passport-avatar">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" />
          ) : (
            <span aria-hidden="true">{initialsFor(displayName) || "K"}</span>
          )}
        </span>
        <span className="profile-passport-camera" aria-hidden="true">
          +
        </span>
      </button>
      <input
        ref={inputRef}
        className="profile-passport-file-input"
        type="file"
        accept="image/*"
        onChange={onFileChange}
      />
      <span className="profile-passport-completion">{completion}% complete</span>
      {message ? (
        <span className="profile-passport-upload-status" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}
