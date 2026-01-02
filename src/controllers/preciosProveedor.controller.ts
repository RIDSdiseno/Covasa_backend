import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { z } from "zod";

/* ================== Schemas ================== */

const precioProveedorUpsertSchema = z.object({
  productoId: z.string().uuid("productoId inválido"),
  proveedorId: z.string().uuid("proveedorId inválido"),
  precio: z.coerce.number().min(0, "Precio debe ser ≥ 0"),
  vigente: z.coerce.boolean().optional().default(true),
});

/* ================== CRUD ================== */

// LIST (?productoId=...&proveedorId=...)
export async function getPreciosProveedor(req: Request, res: Response) {
  try {
    const productoId = req.query.productoId ? String(req.query.productoId) : undefined;
    const proveedorId = req.query.proveedorId ? String(req.query.proveedorId) : undefined;

    const where: any = {};
    if (productoId) where.productoId = productoId;
    if (proveedorId) where.proveedorId = proveedorId;

    const items = await prisma.precioProveedor.findMany({
      where,
      include: { producto: true, proveedor: true },
      orderBy: { updatedAt: "desc" },
    });

    return res.status(200).json(items);
  } catch (err: any) {
    console.error("Error al obtener precios proveedor:", err);
    return res.status(500).json({ error: "Error al obtener precios proveedor" });
  }
}

// UPSERT (create or update por producto+proveedor)
export async function upsertPrecioProveedor(req: Request, res: Response) {
  try {
    const parsed = precioProveedorUpsertSchema.parse(req.body);

    const productoId = parsed.productoId;
    const proveedorId = parsed.proveedorId;
    const precio = Math.trunc(Number(parsed.precio));
    const vigente = Boolean(parsed.vigente);

    const item = await prisma.precioProveedor.upsert({
      where: { productoId_proveedorId: { productoId, proveedorId } },
      create: { productoId, proveedorId, precio, vigente },
      update: { precio, vigente },
      include: { producto: true, proveedor: true },
    });

    return res.status(201).json(item);
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ error: "Validación", issues: err.issues });
    }
    // Si el unique compuesto choca (raro con upsert, pero igual)
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Ya existe ese precio para ese proveedor/producto" });
    }
    // FK no existe (producto o proveedor)
    if (err?.code === "P2003") {
      return res.status(400).json({ error: "productoId o proveedorId no existen" });
    }
    console.error("Error al upsert precio proveedor:", err);
    return res.status(500).json({ error: "Error al guardar precio proveedor" });
  }
}

// DELETE
export async function deletePrecioProveedor(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || typeof id !== "string") return res.status(400).json({ error: "ID inválido" });

    await prisma.precioProveedor.delete({ where: { id } });
    return res.status(204).send();
  } catch (err: any) {
    console.error("Error al eliminar precio proveedor:", err);
    if (err?.code === "P2025") return res.status(404).json({ error: "Registro no encontrado" });
    return res.status(500).json({ error: "Error al eliminar precio proveedor" });
  }
}
