import type { Response } from "express";
import { Prisma } from "@prisma/client";

export function ok(res: Response, data: any, status = 200) {
  return res.status(status).json(data);
}

export function fail(res: Response, status: number, message: string, extra?: any) {
  return res.status(status).json({ message, ...extra });
}

export function handlePrismaError(res: Response, err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint (ej: sku único o unique(productoId, proveedorId))
    if (err.code === "P2002") {
      return fail(res, 409, "Conflicto: ya existe un registro con ese valor único.", {
        meta: err.meta,
        code: err.code,
      });
    }
    // Record not found
    if (err.code === "P2025") {
      return fail(res, 404, "No encontrado.");
    }
  }
  console.error(err);
  return fail(res, 500, "Error interno del servidor.");
}
