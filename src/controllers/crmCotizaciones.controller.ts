import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

// Manual test (curl):
// curl "http://localhost:3000/api/crm/cotizaciones?page=1&pageSize=10"
// curl "http://localhost:3000/api/crm/cotizaciones?estado=NUEVA&q=asd"
// curl "http://localhost:3000/api/crm/cotizaciones/d5365a69-912d-4e41-bf58-324a63b88580"

const listQuerySchema = z.object({
  estado: z.enum(["NUEVA", "EN_REVISION", "RESPONDIDA", "CERRADA"]).optional(),
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(10),
});

function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function buildRange(from?: string, to?: string) {
  const fromDate = parseDate(from);
  if (fromDate === null) {
    return { error: { path: ["from"], message: "from invalido" } as const };
  }
  const toDate = parseDate(to);
  if (toDate === null) {
    return { error: { path: ["to"], message: "to invalido" } as const };
  }

  if (!fromDate && !toDate) return { range: undefined as const };
  return {
    range: {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    },
  };
}

export async function listCrmCotizaciones(req: Request, res: Response) {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Validation error", issues: parsed.error.issues });
  }

  const { estado, q, from, to, page, pageSize } = parsed.data;
  const range = buildRange(from, to);
  if ("error" in range) {
    return res.status(400).json({ message: "Validation error", issues: [range.error] });
  }

  const trimmedQ = q?.trim();
  const skip = (page - 1) * pageSize;

  const where = {
    estado: estado ?? undefined,
    createdAt: range.range,
    OR: trimmedQ
      ? [
          { codigo: { contains: trimmedQ, mode: "insensitive" as const } },
          { rut: { contains: trimmedQ, mode: "insensitive" as const } },
          { email: { contains: trimmedQ, mode: "insensitive" as const } },
          { nombreContacto: { contains: trimmedQ, mode: "insensitive" as const } },
          { telefono: { contains: trimmedQ, mode: "insensitive" as const } },
          { ocCliente: { contains: trimmedQ, mode: "insensitive" as const } },
        ]
      : undefined,
  };

  try {
    const [total, data] = await Promise.all([
      prisma.ecommerce_cotizacion.count({ where }),
      prisma.ecommerce_cotizacion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: pageSize,
        skip,
      }),
    ]);

    return res.json({
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      message: err?.message || "Error listando cotizaciones",
    });
  }
}

export async function getCrmCotizacionById(req: Request, res: Response) {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "id es obligatorio" });
  }

  try {
    const cotizacion = await prisma.ecommerce_cotizacion.findUnique({
      where: { id },
    });

    if (!cotizacion) {
      return res.status(404).json({ message: "Cotizacion no encontrada" });
    }

    return res.json({ data: cotizacion });
  } catch (err: any) {
    return res.status(500).json({
      message: err?.message || "Error obteniendo cotizacion",
    });
  }
}
