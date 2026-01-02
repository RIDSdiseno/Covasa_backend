import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { z } from "zod";

/* ================== Schemas ================== */

const optionalString = z.string().optional().or(z.literal(""));

const proveedorSchema = z.object({
  nombre: z.string().min(1, "Nombre es obligatorio"),
  rut: optionalString,
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  telefono: optionalString,
  contacto: optionalString,
  direccion: optionalString,
});

const proveedorUpdateSchema = proveedorSchema.partial();

/* ================== Helpers ================== */

function emptyToNull(v: any) {
  return v === "" ? null : v;
}

function normalizeProveedorBody(body: any) {
  return {
    ...body,
    rut: emptyToNull(body.rut),
    email: emptyToNull(body.email),
    telefono: emptyToNull(body.telefono),
    contacto: emptyToNull(body.contacto),
    direccion: emptyToNull(body.direccion),
  };
}

/* ================== CRUD ================== */

// CREATE
export async function createProveedor(req: Request, res: Response) {
  try {
    const parsed = proveedorSchema.parse(req.body);
    const data = normalizeProveedorBody(parsed);

    const nuevo = await prisma.proveedor.create({ data });
    return res.status(201).json(nuevo);
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ error: "Validación", issues: err.issues });
    }
    // nombre unique (si lo dejaste @unique)
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Proveedor ya existe (nombre único)" });
    }
    console.error("Error al crear proveedor:", err);
    return res.status(500).json({ error: "Error al crear proveedor" });
  }
}

// READ ALL (?q=)
export async function getProveedores(req: Request, res: Response) {
  try {
    const q = String(req.query.q ?? "").trim();

    const where = q
      ? { nombre: { contains: q, mode: "insensitive" as const } }
      : undefined;

    const proveedores = await prisma.proveedor.findMany({
      where,
      orderBy: { nombre: "asc" },
    });

    return res.status(200).json(proveedores);
  } catch (err: any) {
    console.error("Error al obtener proveedores:", err);
    return res.status(500).json({ error: "Error al obtener proveedores" });
  }
}

// READ ONE (incluye sus precios vigentes)
export async function getProveedorById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "ID inválido" });
    }

    const proveedor = await prisma.proveedor.findUnique({
      where: { id },
      include: {
        precios: {
          where: { vigente: true },
          include: { producto: true },
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (!proveedor) return res.status(404).json({ error: "Proveedor no encontrado" });
    return res.status(200).json(proveedor);
  } catch (err: any) {
    console.error("Error al obtener proveedor:", err);
    return res.status(500).json({ error: "Error al obtener proveedor" });
  }
}

// UPDATE (PATCH)
export async function updateProveedor(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || typeof id !== "string") return res.status(400).json({ error: "ID inválido" });

    const parsed = proveedorUpdateSchema.parse(req.body);
    const data = normalizeProveedorBody(parsed);

    const actualizado = await prisma.proveedor.update({
      where: { id },
      data,
    });

    return res.status(200).json(actualizado);
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ error: "Validación", issues: err.issues });
    }
    if (err?.code === "P2025") return res.status(404).json({ error: "Proveedor no encontrado" });
    if (err?.code === "P2002") return res.status(409).json({ error: "Proveedor ya existe (nombre único)" });

    console.error("Error al actualizar proveedor:", err);
    return res.status(500).json({ error: "Error al actualizar proveedor" });
  }
}

// DELETE
export async function deleteProveedor(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || typeof id !== "string") return res.status(400).json({ error: "ID inválido" });

    await prisma.proveedor.delete({ where: { id } });
    return res.status(204).send();
  } catch (err: any) {
    console.error("Error al eliminar proveedor:", err);
    if (err?.code === "P2025") return res.status(404).json({ error: "Proveedor no encontrado" });
    return res.status(500).json({ error: "Error al eliminar proveedor" });
  }
}
