// src/controllers/cotizaciones.controller.ts
import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import { EcommerceEstadoCotizacion, CrmEstadoCotizacion } from "@prisma/client";
import { prisma } from "../lib/prisma";

/* =========================
   Helpers
========================= */

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parsePage(q: unknown, def = 1) {
  const n = Number(q);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.trunc(n));
}

function parsePageSize(q: unknown, def = 10) {
  const n = Number(q);
  if (!Number.isFinite(n)) return def;
  return clampInt(Math.trunc(n), 5, 200);
}

function parseEstadoCotizacion(v: unknown): EcommerceEstadoCotizacion | undefined {
  const s = asString(v).trim().toUpperCase();
  if (!s) return undefined;

  const allowed = new Set<string>(["NUEVA", "EN_REVISION", "RESPONDIDA", "CERRADA"]);
  if (!allowed.has(s)) return undefined;

  return s as EcommerceEstadoCotizacion;
}

function cleanQuery(q: string) {
  return q.trim();
}

function roundInt(n: number) {
  return Math.trunc(Math.round(n));
}

function safeInt(v: unknown, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function safeMoney(v: unknown, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? roundInt(n) : def;
}

function makeCodigoCotizacion() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `COT-${t}-${r}`;
}

/* =========================
   POST /cotizaciones
========================= */

type CreateCotizacionItemInput = {
  productoId: string;
  descripcion?: string;
  cantidad: number;
  precioUnitarioNeto: number;
  ivaPct?: number; // default 19
};

type CreateCotizacionBody = {
  origen?: string; // default "ECOMMERCE"
  clienteId?: string | null;

  nombreContacto: string;
  email: string;
  telefono: string;

  empresa?: string | null;
  rut?: string | null;

  observaciones?: string | null;
  ocCliente?: string | null;

  items: CreateCotizacionItemInput[];
};

export async function createCotizacion(req: Request, res: Response) {
  try {
    const body = (req.body ?? {}) as Partial<CreateCotizacionBody>;

    const nombreContacto = asString(body.nombreContacto).trim();
    const email = asString(body.email).trim();
    const telefono = asString(body.telefono).trim();

    if (!nombreContacto) return res.status(400).json({ message: "nombreContacto es obligatorio" });
    if (!email) return res.status(400).json({ message: "email es obligatorio" });
    if (!telefono) return res.status(400).json({ message: "telefono es obligatorio" });

    const itemsIn = Array.isArray(body.items) ? body.items : [];
    if (itemsIn.length === 0) return res.status(400).json({ message: "Debes enviar al menos 1 item" });

    const itemsCalc = itemsIn.map((it, idx) => {
      const productoId = asString(it.productoId).trim();
      if (!productoId) throw new Error(`Item #${idx + 1}: productoId es obligatorio`);

      const cantidad = Math.max(1, safeInt(it.cantidad, 1));
      const precioUnitarioNeto = Math.max(0, safeMoney(it.precioUnitarioNeto, 0));
      const ivaPct = Number.isFinite(Number(it.ivaPct)) ? clampInt(safeInt(it.ivaPct, 19), 0, 100) : 19;

      const descripcionSnapshot = asString(it.descripcion).trim() || "Producto";

      const subtotalNetoSnapshot = roundInt(precioUnitarioNeto * cantidad);
      const ivaMontoSnapshot = roundInt((subtotalNetoSnapshot * ivaPct) / 100);
      const totalSnapshot = roundInt(subtotalNetoSnapshot + ivaMontoSnapshot);

      return {
        id: randomUUID(),
        productoId,
        descripcionSnapshot,
        cantidad,
        precioUnitarioNetoSnapshot: precioUnitarioNeto,
        subtotalNetoSnapshot,
        ivaPctSnapshot: ivaPct,
        ivaMontoSnapshot,
        totalSnapshot,
      };
    });

    const subtotalNeto = itemsCalc.reduce((acc, it) => acc + it.subtotalNetoSnapshot, 0);
    const iva = itemsCalc.reduce((acc, it) => acc + it.ivaMontoSnapshot, 0);
    const total = subtotalNeto + iva;

    const now = new Date();

    // ✅ TU SCHEMA REAL: ecommerce_cotizacion + relación ecommerce_cotizacion_item + CrmCotizacion
    // ✅ NO existe relación Cliente en ecommerce_cotizacion (solo clienteId), así que NO incluimos Cliente.
    const created = await prisma.ecommerce_cotizacion.create({
      data: {
        id: randomUUID(),
        codigo: makeCodigoCotizacion(),
        origen: asString(body.origen).trim() || "ECOMMERCE",

        clienteId: body.clienteId ? asString(body.clienteId).trim() : null,

        nombreContacto,
        email,
        telefono,

        empresa: body.empresa ? asString(body.empresa).trim() : null,
        rut: body.rut ? asString(body.rut).trim() : null,

        observaciones: body.observaciones ? asString(body.observaciones) : null,
        ocCliente: body.ocCliente ? asString(body.ocCliente).trim() : null,

        subtotalNeto,
        iva,
        total,

        estado: EcommerceEstadoCotizacion.NUEVA,

        createdAt: now,
        updatedAt: now,

        ecommerce_cotizacion_item: {
          create: itemsCalc.map((it) => ({
            id: it.id,
            cotizacionId: undefined as any, // Prisma lo setea por la relación, no lo pases
            productoId: it.productoId,
            descripcionSnapshot: it.descripcionSnapshot,
            cantidad: it.cantidad,
            precioUnitarioNetoSnapshot: it.precioUnitarioNetoSnapshot,
            subtotalNetoSnapshot: it.subtotalNetoSnapshot,
            ivaPctSnapshot: it.ivaPctSnapshot,
            ivaMontoSnapshot: it.ivaMontoSnapshot,
            totalSnapshot: it.totalSnapshot,
            createdAt: now, // tu schema tiene default(now()), pero dejarlo explícito no molesta
          })),
        },
      },
      include: {
        ecommerce_cotizacion_item: true,
        CrmCotizacion: true,
        ecommerce_cliente: { select: { id: true, nombre: true, rut: true, email: true, telefono: true } },
      },
    });

    res.status(201).json(created);
  } catch (e: any) {
    res.status(500).json({ message: e?.message ?? "Error creando cotización" });
  }
}

/* =========================
   GET /cotizaciones
========================= */
export async function listCotizaciones(req: Request, res: Response) {
  try {
    const q = cleanQuery(asString(req.query.q));
    const estado = parseEstadoCotizacion(req.query.estado);

    const page = parsePage(req.query.page, 1);
    const pageSize = parsePageSize(req.query.pageSize, 10);
    const skip = (page - 1) * pageSize;

    const where = {
      estado: estado ?? undefined,
      OR: q
        ? [
            { codigo: { contains: q, mode: "insensitive" as const } },
            { nombreContacto: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { telefono: { contains: q, mode: "insensitive" as const } },
            { empresa: { contains: q, mode: "insensitive" as const } },
            { rut: { contains: q, mode: "insensitive" as const } },
            { ocCliente: { contains: q, mode: "insensitive" as const } },
          ]
        : undefined,
    };

    const [total, rows] = await Promise.all([
      prisma.ecommerce_cotizacion.count({ where }),
      prisma.ecommerce_cotizacion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: pageSize,
        skip,
        include: {
          // ✅ NO existe Cliente en ecommerce_cotizacion (en tu schema actual)
          ecommerce_cotizacion_item: { select: { id: true } }, // para contar
          CrmCotizacion: { select: { id: true, estado: true, tipoCierre: true } },
          ecommerce_cliente: { select: { id: true, nombre: true, rut: true, email: true, telefono: true } },
        },
      }),
    ]);

    const data = rows.map((r) => ({
      ...r,
      itemsCount: r.ecommerce_cotizacion_item.length,
      ecommerce_cotizacion_item: undefined,
    }));

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      data,
    });
  } catch (e: any) {
    res.status(500).json({ message: e?.message ?? "Error listando cotizaciones" });
  }
}

/* =========================
   GET /cotizaciones/:id
========================= */
export async function getCotizacionById(req: Request, res: Response) {
  try {
    const id = req.params.id;

    const row = await prisma.ecommerce_cotizacion.findUnique({
      where: { id },
      include: {
        CrmCotizacion: true,
        ecommerce_cliente: true,
        ecommerce_cotizacion_item: {
          orderBy: { createdAt: "asc" },
          include: {
            Producto: { select: { id: true, nombre: true, sku: true, unidadMedida: true } },
          },
        },
      },
    });

    if (!row) return res.status(404).json({ message: "Cotización no encontrada" });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ message: e?.message ?? "Error obteniendo cotización" });
  }
}

/* =========================
   PATCH /cotizaciones/:id
========================= */
export async function patchCotizacion(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const estado = parseEstadoCotizacion(body.estado);

    const data: any = {
      updatedAt: new Date(),
    };

    if (estado) data.estado = estado;
    if (typeof body.observaciones === "string") data.observaciones = body.observaciones;
    if (typeof body.ocCliente === "string") data.ocCliente = body.ocCliente;

    if (typeof body.nombreContacto === "string") data.nombreContacto = body.nombreContacto;
    if (typeof body.email === "string") data.email = body.email;
    if (typeof body.telefono === "string") data.telefono = body.telefono;
    if (typeof body.empresa === "string") data.empresa = body.empresa;
    if (typeof body.rut === "string") data.rut = body.rut;

    const updated = await prisma.ecommerce_cotizacion.update({
      where: { id },
      data,
      include: {
        CrmCotizacion: true,
        ecommerce_cliente: { select: { id: true, nombre: true, rut: true, email: true, telefono: true } },
      },
    });

    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ message: e?.message ?? "Error actualizando cotización" });
  }
}

/* =========================
   POST /cotizaciones/:id/convert-to-crm
========================= */
export async function convertToCrm(req: Request, res: Response) {
  try {
    const id = req.params.id;

    const cot = await prisma.ecommerce_cotizacion.findUnique({
      where: { id },
      include: { ecommerce_cliente: true, CrmCotizacion: true },
    });

    if (!cot) return res.status(404).json({ message: "Cotización no encontrada" });

    if (cot.crmCotizacionId) {
      return res.json({
        alreadyLinked: true,
        ecommerceCotizacionId: cot.id,
        crmCotizacionId: cot.crmCotizacionId,
        crmCotizacion: cot.CrmCotizacion ?? null,
      });
    }

    const crm = await prisma.crmCotizacion.create({
      data: {
        clienteId: cot.clienteId ?? null,
        clienteNombreSnapshot: cot.ecommerce_cliente?.nombre ?? cot.empresa ?? cot.nombreContacto,
        clienteRutSnapshot: cot.ecommerce_cliente?.rut ?? cot.rut ?? null,
        clienteEmailSnapshot: cot.ecommerce_cliente?.email ?? cot.email ?? null,
        clienteTelefonoSnapshot: cot.ecommerce_cliente?.telefono ?? cot.telefono ?? null,

        subtotalNeto: cot.subtotalNeto,
        iva: cot.iva,
        total: cot.total,

        observaciones: cot.observaciones ?? null,
        estado: CrmEstadoCotizacion.NUEVA,
      },
    });

    const updated = await prisma.ecommerce_cotizacion.update({
      where: { id },
      data: {
        crmCotizacionId: crm.id,
        estado: EcommerceEstadoCotizacion.EN_REVISION,
        updatedAt: new Date(),
      },
      include: {
        CrmCotizacion: true,
        ecommerce_cliente: { select: { id: true, nombre: true, rut: true } },
      },
    });

    res.json({
      alreadyLinked: false,
      crmCotizacion: crm,
      ecommerceCotizacion: updated,
    });
  } catch (e: any) {
    res.status(500).json({ message: e?.message ?? "Error convirtiendo a CRM" });
  }
}

/* =========================
   POST /cotizaciones/:id/unlink-crm
========================= */
export async function unlinkCrm(req: Request, res: Response) {
  try {
    const id = req.params.id;

    const cot = await prisma.ecommerce_cotizacion.findUnique({ where: { id } });
    if (!cot) return res.status(404).json({ message: "Cotización no encontrada" });

    const updated = await prisma.ecommerce_cotizacion.update({
      where: { id },
      data: { crmCotizacionId: null, updatedAt: new Date() },
      include: { CrmCotizacion: true },
    });

    res.json({ ok: true, ecommerceCotizacion: updated });
  } catch (e: any) {
    res.status(500).json({ message: e?.message ?? "Error desvinculando CRM" });
  }
}
