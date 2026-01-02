// src/controllers/clientes.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { z } from "zod";

/* ================== Schemas ================== */

const estadoSchema = z.enum(["Activo", "Inactivo"]);
const metodoPagoSchema = z.enum(["TRANSBANK", "APPLE_PAY", "TRANSFERENCIA", "OTRO"]); // si tu enum Prisma es EcommerceMetodoPago

const optionalString = z.string().optional().or(z.literal(""));
const optionalNullableString = z.string().nullable().optional().or(z.literal(""));

/**
 * ✅ CREATE: aquí SI exigimos rut (como lo tenías),
 * y agregamos crédito + vendedor + método pago único.
 */
const clienteSchema = z.object({
  nombre: z.string().min(1, "Nombre es obligatorio"),
  rut: z.string().min(6, "RUT inválido"),

  // Contacto
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  telefono: optionalString,
  personaContacto: optionalString,

  // Ubicación
  direccion: optionalString,
  comuna: optionalString,
  ciudad: optionalString,
  region: optionalString,

  estado: estadoSchema.default("Activo"),

  // ✅ Negocio
  lineaCredito: z.coerce.number().int().min(0, "Línea de crédito debe ser ≥ 0").default(0),
  vendedorId: optionalNullableString, // UUID/string (si luego tienes tabla Usuario)
  metodoPagoUnico: metodoPagoSchema,  // obligatorio en create (no editable después)
});

/**
 * ✅ UPDATE: parcial
 * - PERO metodoPagoUnico NO se puede cambiar (lo bloqueamos)
 */
const clienteUpdateSchema = clienteSchema
  .partial()
  .extend({
    // en PATCH rut no debería ser obligatorio (ya no lo es por partial),
    // pero si llega vacío, lo limpiamos
    rut: z.string().min(6, "RUT inválido").optional().or(z.literal("")),
  });

/* ================== Helpers ================== */

function emptyToNull(v: any) {
  if (v === "" || v === undefined) return null;
  return v;
}

/**
 * ✅ Normaliza SIN pisar campos en PATCH:
 * - si el campo viene undefined => lo dejamos undefined (Prisma no lo cambia)
 * - si viene "" => null
 */
function normalizeClienteBody(body: any, mode: "create" | "update") {
  const out: any = {};

  // nombre
  if (body.nombre !== undefined) out.nombre = body.nombre;

  // rut
  if (body.rut !== undefined) out.rut = emptyToNull(body.rut);

  // contacto
  if (body.email !== undefined) out.email = emptyToNull(body.email);
  if (body.telefono !== undefined) out.telefono = emptyToNull(body.telefono);
  if (body.personaContacto !== undefined) out.personaContacto = emptyToNull(body.personaContacto);

  // ubicación
  if (body.direccion !== undefined) out.direccion = emptyToNull(body.direccion);
  if (body.comuna !== undefined) out.comuna = emptyToNull(body.comuna);
  if (body.ciudad !== undefined) out.ciudad = emptyToNull(body.ciudad);
  if (body.region !== undefined) out.region = emptyToNull(body.region);

  // estado
  if (mode === "create") out.estado = body.estado ?? "Activo";
  else if (body.estado !== undefined) out.estado = body.estado;

  // negocio
  if (mode === "create") {
    out.lineaCredito = Math.trunc(Number(body.lineaCredito ?? 0));
    out.vendedorId = emptyToNull(body.vendedorId);
    out.metodoPagoUnico = body.metodoPagoUnico; // obligatorio en create
  } else {
    if (body.lineaCredito !== undefined) out.lineaCredito = Math.trunc(Number(body.lineaCredito));
    if (body.vendedorId !== undefined) out.vendedorId = emptyToNull(body.vendedorId);
    // metodoPagoUnico lo bloqueamos en update (ver controller)
  }

  return out;
}

function isZodError(err: any): err is z.ZodError {
  return err?.name === "ZodError";
}

/* ================== CRUD ================== */

// CREATE
export async function createCliente(req: Request, res: Response) {
  try {
    const parsed = clienteSchema.parse(req.body);
    const data = normalizeClienteBody(parsed, "create");

    const nuevo = await prisma.cliente.create({ data });

    return res.status(201).json(nuevo);
  } catch (err: any) {
    if (isZodError(err)) {
      return res.status(400).json({ error: "Validación", issues: err.issues });
    }
    // RUT unique (si aplica en tu schema real)
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "RUT ya existe" });
    }
    console.error("Error al crear cliente:", err);
    return res.status(500).json({ error: "Error al crear cliente" });
  }
}

// READ ALL (?q=)
export async function getClientes(req: Request, res: Response) {
  try {
    const q = String(req.query.q ?? "").trim();

    const where =
      q.length > 0
        ? {
            OR: [
              { nombre: { contains: q, mode: "insensitive" as const } },
              { rut: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { telefono: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : undefined;

    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { nombre: "asc" },
    });

    return res.status(200).json(clientes);
  } catch (err: any) {
    console.error("Error al obtener clientes:", err);
    return res.status(500).json({ error: "Error al obtener clientes" });
  }
}

// READ ONE
export async function getClienteById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "ID inválido" });
    }

    const cliente = await prisma.cliente.findUnique({
      where: { id },
    });

    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });
    return res.status(200).json(cliente);
  } catch (err: any) {
    console.error("Error al obtener cliente:", err);
    return res.status(500).json({ error: "Error al obtener cliente" });
  }
}

// UPDATE (PATCH)
export async function updateCliente(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || typeof id !== "string") return res.status(400).json({ error: "ID inválido" });

    // traemos el actual para proteger metodoPagoUnico
    const current = await prisma.cliente.findUnique({
      where: { id },
      select: { id: true, metodoPagoUnico: true },
    });
    if (!current) return res.status(404).json({ error: "Cliente no encontrado" });

    const parsed = clienteUpdateSchema.parse(req.body);

    // ✅ Bloquear edición de método de pago único
    if (parsed.metodoPagoUnico !== undefined && parsed.metodoPagoUnico !== current.metodoPagoUnico) {
      return res.status(400).json({
        error: "Validación",
        issues: [{ path: ["metodoPagoUnico"], message: "El método de pago del cliente no es editable." }],
      });
    }

    const data = normalizeClienteBody(parsed, "update");
    delete data.metodoPagoUnico; // ✅ por seguridad extra

    const actualizado = await prisma.cliente.update({
      where: { id },
      data,
    });

    return res.status(200).json(actualizado);
  } catch (err: any) {
    if (isZodError(err)) {
      return res.status(400).json({ error: "Validación", issues: err.issues });
    }
    if (err?.code === "P2025") return res.status(404).json({ error: "Cliente no encontrado" });
    if (err?.code === "P2002") return res.status(409).json({ error: "RUT ya existe" });

    console.error("Error al actualizar cliente:", err);
    return res.status(500).json({ error: "Error al actualizar cliente" });
  }
}

// DELETE
export async function deleteCliente(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || typeof id !== "string") return res.status(400).json({ error: "ID inválido" });

    await prisma.cliente.delete({ where: { id } });
    return res.status(204).send();
  } catch (err: any) {
    console.error("Error al eliminar cliente:", err);
    if (err?.code === "P2025") return res.status(404).json({ error: "Cliente no encontrado" });
    return res.status(500).json({ error: "Error al eliminar cliente" });
  }
}
