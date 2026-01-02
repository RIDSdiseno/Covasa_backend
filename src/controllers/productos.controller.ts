// src/controllers/productos.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { z } from "zod";
import {
  uploadBufferToCloudinary,
  deleteFromCloudinary,
} from "../lib/cloudinaryUpload";

/* ================== Schemas ================== */

// acepta "", undefined o null
const optionalString = z.string().optional().or(z.literal(""));
const optionalNullableString = z.string().nullable().optional().or(z.literal(""));

/**
 * ✅ Prisma enum: Producto | Servicio
 * ✅ fotoUrl queda como opcional (por compatibilidad)
 * ✅ soporta multipart/form-data + archivos
 */
const productoSchema = z.object({
  nombre: z.string().min(1, "Nombre es obligatorio"),
  sku: optionalNullableString,
  unidadMedida: optionalString.default("unidad"),
  fotoUrl: optionalNullableString,

  tipo: z.enum(["Producto", "Servicio"]).default("Producto"),

  precioGeneral: z.coerce.number().min(0, "Precio general debe ser ≥ 0").default(0),
  precioConDescto: z.coerce.number().min(0, "Precio con descuento debe ser ≥ 0").default(0),
});

const productoUpdateSchema = productoSchema.partial();

/* ================== Helpers ================== */

function emptyToNull(v: any) {
  if (v === "" || v === undefined) return null;
  return v;
}

/**
 * ✅ Normaliza SIN pisar campos en PATCH si no vienen.
 * - En create aplica defaults razonables.
 * - En update solo incluye lo que venga definido.
 */
function normalizeProductoBody(body: any, mode: "create" | "update") {
  const out: any = {};

  // nombre
  if (body.nombre !== undefined) out.nombre = body.nombre;

  // sku
  if (body.sku !== undefined) out.sku = emptyToNull(body.sku);

  // unidadMedida
  if (mode === "create") {
    out.unidadMedida =
      body.unidadMedida && body.unidadMedida !== "" ? body.unidadMedida : "unidad";
  } else {
    if (body.unidadMedida !== undefined) {
      out.unidadMedida =
        body.unidadMedida && body.unidadMedida !== "" ? body.unidadMedida : "unidad";
    }
  }

  // fotoUrl (compatibilidad si no subes archivo)
  if (body.fotoUrl !== undefined) out.fotoUrl = emptyToNull(body.fotoUrl);

  // tipo
  if (mode === "create") {
    out.tipo = body.tipo ?? "Producto";
  } else {
    if (body.tipo !== undefined) out.tipo = body.tipo;
  }

  // precios
  if (body.precioGeneral !== undefined && body.precioGeneral !== null) {
    out.precioGeneral = Math.trunc(Number(body.precioGeneral));
  }
  if (body.precioConDescto !== undefined && body.precioConDescto !== null) {
    out.precioConDescto = Math.trunc(Number(body.precioConDescto));
  }

  return out;
}

/**
 * ✅ Para upload.array("fotos", N)
 * - req.files es array
 */
function getFiles(req: Request): Express.Multer.File[] {
  const files = (req as any).files;
  return Array.isArray(files) ? (files as Express.Multer.File[]) : [];
}

function getCloudinaryFolder() {
  return process.env.CLOUDINARY_FOLDER || "covasa/productos";
}

/** Subida múltiple a Cloudinary (usa tu helper con sharp + stream) */
async function uploadManyToCloudinary(files: Express.Multer.File[]) {
  const real = files.filter((f) => f?.buffer);
  if (real.length === 0) return [];

  const uploads = await Promise.all(
    real.map((f) => uploadBufferToCloudinary(f.buffer, { folder: getCloudinaryFolder() }))
  );

  return uploads; // [{secure_url, public_id}, ...]
}

/* ================== CRUD ================== */

/**
 * CREATE (multipart/form-data)
 * - campos normales en body
 * - archivos en field: "fotos" (pueden ser 1..N)
 *
 * ✅ Crea Producto + ProductoImagen[]
 * ✅ Mantiene fotoUrl/fotoPublicId como "principal" (primera imagen)
 */
export async function createProducto(req: Request, res: Response) {
  try {
    const parsed = productoSchema.parse(req.body);

    const data: any = normalizeProductoBody(parsed, "create");

    const files = getFiles(req);
    const uploads = await uploadManyToCloudinary(files);

    if (uploads.length > 0) {
      // principal (compatibilidad)
      data.fotoUrl = uploads[0].secure_url;
      data.fotoPublicId = uploads[0].public_id;

      // galería
      data.imagenes = {
        create: uploads.map((u, idx) => ({
          url: u.secure_url,
          publicId: u.public_id,
          orden: idx,
        })),
      };
    }

    const nuevo = await prisma.producto.create({
      data,
      include: { imagenes: { orderBy: { orden: "asc" } } },
    });

    return res.status(201).json(nuevo);
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ error: "Validación", issues: err.issues });
    }
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "SKU ya existe" });
    }
    console.error("Error al crear producto:", err);
    return res.status(500).json({ error: "Error al crear producto" });
  }
}

/**
 * READ ALL (?q=)
 */
export async function getProductos(req: Request, res: Response) {
  try {
    const q = String(req.query.q ?? "").trim();

    const where = q
      ? {
          OR: [
            { nombre: { contains: q, mode: "insensitive" as const } },
            { sku: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : undefined;

    const productos = await prisma.producto.findMany({
      where,
      orderBy: { nombre: "asc" },
      include: {
        imagenes: { orderBy: { orden: "asc" } }, // ✅ devuelve galería
      },
    });

    return res.status(200).json(productos);
  } catch (err: any) {
    console.error("Error al obtener productos:", err);
    return res.status(500).json({ error: "Error al obtener productos" });
  }
}

/**
 * READ ONE
 */
export async function getProductoById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || typeof id !== "string") return res.status(400).json({ error: "ID inválido" });

    const producto = await prisma.producto.findUnique({
      where: { id },
      include: {
        imagenes: { orderBy: { orden: "asc" } }, // ✅
        preciosProveedor: {
          where: { vigente: true },
          include: { proveedor: true },
          orderBy: { precio: "asc" },
        },
      },
    });

    if (!producto) return res.status(404).json({ error: "Producto no encontrado" });
    return res.status(200).json(producto);
  } catch (err: any) {
    console.error("Error al obtener producto:", err);
    return res.status(500).json({ error: "Error al obtener producto" });
  }
}

/**
 * UPDATE (PATCH multipart/form-data opcional)
 * - si vienen archivos "fotos": los AGREGA (no borra las existentes)
 * - si quieres "reemplazar todo", dime y te lo dejo en modo replace.
 *
 * ✅ Si el producto no tiene foto principal, setea la primera nueva como principal.
 */
export async function updateProducto(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || typeof id !== "string") return res.status(400).json({ error: "ID inválido" });

    const current = await prisma.producto.findUnique({
      where: { id },
      select: { id: true, fotoUrl: true, fotoPublicId: true },
    });
    if (!current) return res.status(404).json({ error: "Producto no encontrado" });

    const parsed = productoUpdateSchema.parse(req.body);
    const data: any = normalizeProductoBody(parsed, "update");

    const files = getFiles(req);
    const uploads = await uploadManyToCloudinary(files);

    if (uploads.length > 0) {
      // ✅ agrega nuevas imágenes
      data.imagenes = {
        create: uploads.map((u) => ({
          url: u.secure_url,
          publicId: u.public_id,
        })),
      };

      // ✅ si no hay principal, usar la primera nueva
      if (!current.fotoPublicId) {
        data.fotoUrl = uploads[0].secure_url;
        data.fotoPublicId = uploads[0].public_id;
      }
    }

    const actualizado = await prisma.producto.update({
      where: { id },
      data,
      include: { imagenes: { orderBy: { orden: "asc" } } },
    });

    return res.status(200).json(actualizado);
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ error: "Validación", issues: err.issues });
    }
    if (err?.code === "P2025") return res.status(404).json({ error: "Producto no encontrado" });
    if (err?.code === "P2002") return res.status(409).json({ error: "SKU ya existe" });

    console.error("Error al actualizar producto:", err);
    return res.status(500).json({ error: "Error al actualizar producto" });
  }
}

/**
 * DELETE (borra también:
 * - imagen principal (fotoPublicId) si existe
 * - todas las imágenes de la galería (ProductoImagen.publicId)
 */
export async function deleteProducto(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || typeof id !== "string") return res.status(400).json({ error: "ID inválido" });

    const current = await prisma.producto.findUnique({
      where: { id },
      select: {
        fotoPublicId: true,
        imagenes: { select: { publicId: true } },
      },
    });
    if (!current) return res.status(404).json({ error: "Producto no encontrado" });

    await prisma.producto.delete({ where: { id } });

    // ✅ borrar principal
    if (current.fotoPublicId) {
      deleteFromCloudinary(current.fotoPublicId).catch((e) =>
        console.warn("No se pudo borrar imagen principal en Cloudinary:", e?.message || e)
      );
    }

    // ✅ borrar galería (puede incluir la principal también; no pasa nada si "not found")
    const ids = (current.imagenes ?? []).map((x) => x.publicId).filter(Boolean);
    await Promise.all(
      ids.map((pid) =>
        deleteFromCloudinary(pid).catch((e) =>
          console.warn("No se pudo borrar imagen galería en Cloudinary:", e?.message || e)
        )
      )
    );

    return res.status(204).send();
  } catch (err: any) {
    console.error("Error al eliminar producto:", err);
    if (err?.code === "P2025") return res.status(404).json({ error: "Producto no encontrado" });
    return res.status(500).json({ error: "Error al eliminar producto" });
  }
}

/**
 * ✅ EXTRA: borrar 1 imagen específica (recomendado)
 * DELETE /productos/:id/imagenes/:imageId
 */
export async function deleteProductoImagen(req: Request, res: Response) {
  try {
    const { id, imageId } = req.params;
    if (!id || typeof id !== "string") return res.status(400).json({ error: "ID inválido" });
    if (!imageId || typeof imageId !== "string")
      return res.status(400).json({ error: "ID imagen inválido" });

    const img = await prisma.productoImagen.findFirst({
      where: { id: imageId, productoId: id },
    });
    if (!img) return res.status(404).json({ error: "Imagen no encontrada" });

    await prisma.productoImagen.delete({ where: { id: imageId } });

    // si era la principal, opcionalmente limpiar principal (o setear otra como principal)
    const producto = await prisma.producto.findUnique({
      where: { id },
      select: { fotoPublicId: true },
    });

    if (producto?.fotoPublicId && producto.fotoPublicId === img.publicId) {
      // intenta setear otra imagen como principal, si existe
      const otra = await prisma.productoImagen.findFirst({
        where: { productoId: id, id: { not: imageId } },
        orderBy: { orden: "asc" },
      });

      await prisma.producto.update({
        where: { id },
        data: {
          fotoPublicId: otra?.publicId ?? null,
          fotoUrl: otra?.url ?? null,
        },
      });
    }

    deleteFromCloudinary(img.publicId).catch((e) =>
      console.warn("No se pudo borrar imagen en Cloudinary:", e?.message || e)
    );

    return res.status(204).send();
  } catch (err: any) {
    console.error("Error al eliminar imagen producto:", err);
    return res.status(500).json({ error: "Error al eliminar imagen" });
  }
}
