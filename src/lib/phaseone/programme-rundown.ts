export const programmeRundownBucket = "programme-rundowns";
export const programmeRundownMaxFileSize = 5 * 1024 * 1024;
export const programmeRundownMaxImagesPerEvent = 20;
export const programmeRundownMaxFilesPerSelection = 10;

export const programmeRundownMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ProgrammeRundownMimeType =
  (typeof programmeRundownMimeTypes)[number];

const extensions: Record<ProgrammeRundownMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isProgrammeRundownMimeType(
  value: string,
): value is ProgrammeRundownMimeType {
  return programmeRundownMimeTypes.includes(value as ProgrammeRundownMimeType);
}

export function programmeRundownExtension(
  contentType: ProgrammeRundownMimeType,
): string {
  return extensions[contentType];
}
