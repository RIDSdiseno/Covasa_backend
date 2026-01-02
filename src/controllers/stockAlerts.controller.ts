import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { z } from "zod";

const statusSchema = z.enum(["OPEN", "ACK", "RESOLVED"]);

function isPrismaKnownError(e: unknown): e is { code?: string } {
  return !!e && typeof e === "object" && "code" in e;
}

/**
 * GET /api/stock-alerts?status=OPEN|ACK|RESOLVED
 * - Por defecto: OPEN
 * - Incluye inventario + producto (para que el front NO filtre a null)
 */
export async function listStockAlerts(req: Request, res: Response) {
  try {
    const statusRaw = req.query.status ? String(req.query.status).toUpperCase() : "OPEN";
    const parsed = statusSchema.safeParse(statusRaw);
    const status = parsed.success ? parsed.data : "OPEN";

    const alerts = await prisma.stockAlert.findMany({
      where: { status },
      orderBy: { openedAt: "desc" },
      include: {
        inventario: {
          include: { producto: true },
        },
      },
      take: 200,
    });

    return res.json(alerts);
  } catch (e) {
    console.error("listStockAlerts error:", e);
    return res.status(500).json({ error: "Error al listar alertas" });
  }
}

/**
 * POST /api/stock-alerts/:id/ack
 * - Idempotente: si ya está ACK o RESOLVED, devuelve el registro igual.
 * - 404 si no existe
 */
export async function ackStockAlert(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const current = await prisma.stockAlert.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!current) return res.status(404).json({ error: "Alerta no encontrada" });

    // idempotente
    if (current.status !== "OPEN") {
      const same = await prisma.stockAlert.findUnique({ where: { id } });
      return res.json(same);
    }

    const updated = await prisma.stockAlert.update({
      where: { id },
      data: { status: "ACK", ackAt: new Date() },
    });

    return res.json(updated);
  } catch (e) {
    console.error("ackStockAlert error:", e);

    if (isPrismaKnownError(e) && e.code === "P2025") {
      return res.status(404).json({ error: "Alerta no encontrada" });
    }

    return res.status(500).json({ error: "Error al marcar como visto" });
  }
}

/**
 * (Opcional pero recomendado)
 * GET /api/stock-alerts/count?status=OPEN
 * - Para badge rápido sin traer 200 rows
 */
export async function countStockAlerts(req: Request, res: Response) {
  try {
    const statusRaw = req.query.status ? String(req.query.status).toUpperCase() : "OPEN";
    const parsed = statusSchema.safeParse(statusRaw);
    const status = parsed.success ? parsed.data : "OPEN";

    const count = await prisma.stockAlert.count({ where: { status } });
    return res.json({ status, count });
  } catch (e) {
    console.error("countStockAlerts error:", e);
    return res.status(500).json({ error: "Error al contar alertas" });
  }
}

/**
 * (Opcional)
 * POST /api/stock-alerts/:id/resolve
 * - Para cerrar manualmente si lo necesitas
 */
export async function resolveStockAlert(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const current = await prisma.stockAlert.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!current) return res.status(404).json({ error: "Alerta no encontrada" });

    if (current.status === "RESOLVED") {
      const same = await prisma.stockAlert.findUnique({ where: { id } });
      return res.json(same);
    }

    const updated = await prisma.stockAlert.update({
      where: { id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });

    return res.json(updated);
  } catch (e) {
    console.error("resolveStockAlert error:", e);

    if (isPrismaKnownError(e) && e.code === "P2025") {
      return res.status(404).json({ error: "Alerta no encontrada" });
    }

    return res.status(500).json({ error: "Error al resolver alerta" });
  }
}
