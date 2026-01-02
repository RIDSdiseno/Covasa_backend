// src/middlewares/upload.ts
import type { Request, Response, NextFunction } from "express";
import multer from "multer";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024, // 8MB por imagen
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    return cb(new Error("Archivo inválido. Sube una imagen (jpg/png/webp)."));
  },
});

// 1 imagen genérica (field "image" por ejemplo)
export const uploadSingleImage = upload.single("image");

// ✅ múltiples imágenes para productos (field "fotos")
export const uploadMultiImages = upload.array("fotos", 10);

// (Opcional) helper para tipar req.files como array en tus controllers
export function getMulterFiles(req: Request): Express.Multer.File[] {
  const f = (req as any).files;
  return Array.isArray(f) ? (f as Express.Multer.File[]) : [];
}
