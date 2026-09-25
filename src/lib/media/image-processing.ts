type ProcessImageOptions = Readonly<{
  width: number;
  height: number;
  maxBytes: number;
  initialQuality?: number;
}>;

const maxSourceBytes = 20 * 1024 * 1024;

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
      reject(new Error("This image format could not be read. Try a JPEG, PNG or WebP image."));
    };
    image.src = objectUrl;
  });
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("The image could not be prepared for upload."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

export async function processImageForUpload(
  file: File,
  options: ProcessImageOptions,
): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 0) {
    throw new Error("Choose a valid image file.");
  }
  if (file.size > maxSourceBytes) {
    throw new Error("Choose an image smaller than 20 MB.");
  }

  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Your browser could not prepare this image.");

  const targetRatio = options.width / options.height;
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else if (sourceRatio < targetRatio) {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    options.width,
    options.height,
  );

  let quality = options.initialQuality ?? 0.84;
  let blob = await canvasToWebp(canvas, quality);
  while (blob.size > options.maxBytes && quality > 0.5) {
    quality -= 0.08;
    blob = await canvasToWebp(canvas, quality);
  }

  if (blob.size > options.maxBytes) {
    throw new Error("The processed image is still too large. Try a simpler or smaller image.");
  }

  return new File([blob], "image.webp", {
    type: "image/webp",
    lastModified: Date.now(),
  });
}
