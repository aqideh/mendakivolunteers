"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

function extensionFor(file: File) {
  switch (file.type) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
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
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      setMessage("Use a JPG, PNG or WebP image.");
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setMessage("Profile photos must be 2 MB or smaller.");
      return;
    }

    setIsUploading(true);
    setMessage(null);

    const supabase = createClient() as unknown as SupabaseClient;
    const extension = extensionFor(file);
    const nextPath = `${userId}/avatar-${Date.now()}.${extension}`;
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    const { error: uploadError } = await supabase.storage
      .from("volunteer-profile-photos")
      .upload(nextPath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(avatarUrl);
      setMessage("Photo upload failed. Try again.");
      setIsUploading(false);
      return;
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
      await supabase.storage
        .from("volunteer-profile-photos")
        .remove([nextPath]);
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(avatarUrl);
      setMessage("Photo could not be saved to your profile.");
      setIsUploading(false);
      return;
    }

    if (avatarPath && avatarPath !== nextPath) {
      await supabase.storage
        .from("volunteer-profile-photos")
        .remove([avatarPath]);
    }

    setMessage("Profile photo updated.");
    setIsUploading(false);
    router.refresh();
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
          style={{ "--profile-completion": `${completion * 3.6}deg` } as React.CSSProperties}
          aria-hidden="true"
        />
        <span className="profile-passport-avatar">
          {previewUrl ? (
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
        accept="image/jpeg,image/png,image/webp"
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
