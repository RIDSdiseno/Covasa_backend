import cloudinary from "./cloudinary";
import sharp from "sharp";
import type { UploadApiErrorResponse, UploadApiResponse } from "cloudinary";

type UploadResult = { secure_url: string; public_id: string };

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  opts?: { folder?: string; public_id?: string }
): Promise<UploadResult> {
  // ✅ Optimización previa (ahorro real)
  const optimized = await sharp(buffer)
    .rotate() // respeta EXIF
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 70 }) // 60-75 suele ser buen balance
    .toBuffer();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: opts?.folder,
        public_id: opts?.public_id,
        resource_type: "image",
        // Como ya subimos WEBP optimizado, no hace falta transformation pesada.
        // (si la quieres dejar, ok, pero acá ya ahorras de verdad)
      },
      (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
        if (error || !result) return reject(error ?? new Error("Upload sin resultado"));
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );

    stream.end(optimized);
  });
}

export async function deleteFromCloudinary(public_id: string) {
  if (!public_id) return null;

  const r = await cloudinary.uploader.destroy(public_id, {
    resource_type: "image",
    invalidate: true, // ✅ limpia cache CDN (opcional pero útil)
  });

  console.log("[cloudinary] destroy", public_id, r);
  return r; // { result: "ok" | "not found" | ... }
}
