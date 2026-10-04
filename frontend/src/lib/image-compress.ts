// Client-side avatar downscale, before the multipart POST to /api/upload.
//
// Vercel enforces a hard ~4.3MB request-body ceiling on every Serverless
// Function (FUNCTION_PAYLOAD_TOO_LARGE, not configurable via vercel.json or
// route code) — well below what a modern phone camera produces (often
// 3-8MB per photo). Without this, most real-world avatar uploads failed
// before the app's own UPLOAD_MAX_BYTES check ever ran, surfacing Vercel's
// raw platform error page instead of a friendly message.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
// Files already under this size skip re-encoding entirely, to avoid a
// pointless quality hit on something that was already going to fit.
const SKIP_IF_UNDER_BYTES = 1.5 * 1024 * 1024;

/**
 * Downscales and re-encodes an image file for upload, client-side. Returns
 * the original file unchanged if it's not an image, is already small, or
 * compression fails for any reason (corrupt file, unsupported format,
 * canvas unavailable) — the server's own size/MIME/magic-byte checks are
 * the real gate, this is purely a best-effort size reduction.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size <= SKIP_IF_UNDER_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });
    if (!blob || blob.size >= file.size) return file;

    const newName = `${file.name.replace(/\.[^./]+$/, '')}.jpg`;
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
