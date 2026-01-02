import type { Request, Response } from "express";
import { uploadBufferToCloudinary } from "../lib/cloudinaryUpload";

export async function uploadImage(req: Request, res: Response) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "Debes subir una imagen en el campo 'file'." });
    }

    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "covasa/productos",
    });

    return res.status(201).json({
      secure_url: result.secure_url,
      public_id: result.public_id,
    });
  } catch (e: any) {
    console.error("uploadImage error:", e?.message || e);
    return res.status(500).json({ error: "Error al subir imagen" });
  }
}
