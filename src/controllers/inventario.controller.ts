import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { z } from "zod";
import XLSX from "xlsx";
import { Prisma, ProductoTipo } from "@prisma/client";
import { randomUUID } from "crypto";

/* ================== Prisma enum helpers ================== */

// Obtiene todos los valores reales del enum Prisma en runtime
const PRODUCTO_TIPO_VALUES = Object.values(ProductoTipo) as ProductoTipo[];

// Regla robusta: considera flete si el string del enum contiene "flet"
function isFleteTipo(tipo: ProductoTipo | string | null | undefined) {
  return String(tipo ?? "").toLowerCase().includes("flet");
}

// Mapea strings humanos ("Producto"/"Flete") al enum real de Prisma
function mapTipoToPrismaEnum(raw: unknown): ProductoTipo | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const lower = s.toLowerCase();

  // Intento 1: match exacto
  const exact = PRODUCTO_TIPO_VALUES.find((v) => String(v) === s);
  if (exact) return exact;

  // Intento 2: match case-insensitive exacto
  const ciExact = PRODUCTO_TIPO_VALUES.find((v) => String(v).toLowerCase() === lower);
  if (ciExact) return ciExact;

  // Intento 3: heurística por contenido
  if (lower.includes("flet")) {
    const f = PRODUCTO_TIPO_VALUES.find((v) => String(v).toLowerCase().includes("flet"));
    return f ?? null;
  }
  if (lower.includes("prod")) {
    const p = PRODUCTO_TIPO_VALUES.find((v) => !String(v).toLowerCase().includes("flet"));
    return p ?? null;
  }

  return null;
}

/* ================== Schemas ================== */

const optionalString = z.string().optional().or(z.literal(""));

const inventarioSchema = z.object({
  productoId: z.string().uuid("productoId inválido"),
  codigo: optionalString,
  stock: z.coerce.number().int("stock debe ser entero").min(0, "stock debe ser ≥ 0").default(0),
  minimo: z.coerce.number().int("minimo debe ser entero").min(0, "minimo debe ser ≥ 0").default(0),
  ubicacion: optionalString,
});

const inventarioUpdateSchema = inventarioSchema.partial().omit({ productoId: true });

const createMovimientoSchema = z.object({
  inventarioId: z.string().uuid("inventarioId inválido"),
  tipo: z.enum(["Entrada", "Salida", "Ajuste"]),
  cantidad: z.coerce.number().int("cantidad debe ser entero").min(1, "cantidad debe ser ≥ 1"),
  nota: optionalString,
});

/* ================== Error helpers ================== */

type ApiErrorBody = {
  error?: string;
  message?: string;
  issues?: Array<{ path?: Array<string | number>; message?: string }>;
};

type ApiError = Error & {
  status?: number;
  code?: string;
  body?: ApiErrorBody;
};

function isApiError(e: unknown): e is ApiError {
  return e instanceof Error;
}

function errorMessage(e: unknown, fallback: string) {
  if (!isApiError(e)) return fallback;
  return e.body?.error || e.body?.message || e.message || fallback;
}

function errorCode(e: unknown): string | undefined {
  if (!isApiError(e)) return undefined;
  return e.code;
}

function prismaCode(e: unknown): string | undefined {
  if (!e || typeof e !== "object") return undefined;
  const maybe = e as { code?: unknown };
  return typeof maybe.code === "string" ? maybe.code : undefined;
}

function isZodError(e: unknown): e is z.ZodError {
  return !!e && typeof e === "object" && "name" in e && (e as { name?: unknown }).name === "ZodError";
}

/* ================== Normalize helpers ================== */

function emptyToNull(v: string | null | undefined) {
  if (v == null) return null;
  const s = v.trim();
  return s === "" ? null : s;
}

type InventarioCreateParsed = z.infer<typeof inventarioSchema>;
type InventarioUpdateParsed = z.infer<typeof inventarioUpdateSchema>;
type MovimientoCreateParsed = z.infer<typeof createMovimientoSchema>;

function normalizeInventarioCreate(body: InventarioCreateParsed) {
  return {
    productoId: body.productoId,
    codigo: emptyToNull(body.codigo),
    ubicacion: emptyToNull(body.ubicacion),
    stock: Math.trunc(Number(body.stock ?? 0)),
    minimo: Math.trunc(Number(body.minimo ?? 0)),
  };
}

function normalizeInventarioUpdate(body: InventarioUpdateParsed) {
  return {
    codigo: body.codigo === undefined ? undefined : emptyToNull(body.codigo),
    ubicacion: body.ubicacion === undefined ? undefined : emptyToNull(body.ubicacion),
    stock: body.stock === undefined ? undefined : Math.trunc(Number(body.stock)),
    minimo: body.minimo === undefined ? undefined : Math.trunc(Number(body.minimo)),
  };
}

function normalizeMovimientoBody(body: MovimientoCreateParsed) {
  return {
    inventarioId: body.inventarioId,
    tipo: body.tipo,
    cantidad: Math.trunc(Number(body.cantidad)),
    nota: emptyToNull(body.nota),
  };
}

/* ================== Business rules ================== */

async function assertProductoNoEsFlete(productoId: string) {
  const prod = await prisma.producto.findUnique({
    where: { id: productoId },
    select: { id: true, tipo: true },
  });

  if (!prod) {
    const err: ApiError = new Error("Producto no existe");
    err.code = "PRODUCTO_NOT_FOUND";
    throw err;
  }

  if (isFleteTipo(prod.tipo)) {
    const err: ApiError = new Error("No se puede manejar inventario para un flete");
    err.code = "PRODUCTO_ES_FLETE";
    throw err;
  }
}

/* ================== STOCK CRÍTICO (CORE) ================== */

const DEFAULT_COOLDOWN_MINUTES = 360;

async function evaluateStockCriticalTx(tx: Prisma.TransactionClient, inventarioId: string) {
  const inv = await tx.inventario.findUnique({
    where: { id: inventarioId },
    include: {
      producto: {
        select: {
          id: true,
          nombre: true,
          sku: true,
          tipo: true,
        },
      },
    },
  });

  if (!inv) return { action: "noop", reason: "inventario_not_found" };

  // si por alguna razón es flete, no hacemos nada
  if (isFleteTipo(inv.producto?.tipo)) return { action: "noop", reason: "producto_es_flete" };

  const rule = await tx.stockCriticalRule.findUnique({
    where: { inventarioId },
  });

  // Si hay regla y está deshabilitada -> no notificar
  if (rule && rule.enabled === false) return { action: "noop", reason: "rule_disabled" };

  const threshold = rule?.thresholdOverride ?? inv.minimo ?? 0;
  const cooldownMinutes = rule?.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES;

  const isCritical = inv.stock <= threshold;

  const activeAlert = await tx.stockAlert.findFirst({
    where: { inventarioId, isActive: true },
    orderBy: { openedAt: "desc" },
  });

  const now = new Date();

  // Si está crítico:
  if (isCritical) {
    // Crear nueva alerta activa si no existe
    if (!activeAlert) {
      const alert = await tx.stockAlert.create({
        data: {
          inventarioId,
          threshold,
          stockAtAlert: inv.stock,
          status: "OPEN",
          isActive: true,
          lastSentAt: now,
          channel: "system",
          meta: {
            productoId: inv.productoId, // ✅ existe en inv
            productoNombre: inv.producto.nombre,
            sku: inv.producto.sku,
          },
        },
      });

      if (rule) {
        await tx.stockCriticalRule.update({
          where: { inventarioId },
          data: { lastNotifiedAt: now },
        });
      }

      // Notificación para panel ecommerce
      await tx.ecommerceNotificacion.create({
        data: {
          id: randomUUID(),
          tipo: "STOCK_CRITICO",
          referenciaTabla: "Inventario",
          referenciaId: inventarioId,
          titulo: `Stock crítico: ${inv.producto.nombre}`,
          detalle: `Stock ${inv.stock} (mínimo ${threshold}).`,
          leido: false,
        },
      });

      return { action: "created", alertId: alert.id };
    }

    // Ya hay alerta activa: re-notificar solo si pasó cooldown
    const last = rule?.lastNotifiedAt ?? activeAlert.lastSentAt ?? activeAlert.openedAt;

    const cooldownMs = cooldownMinutes * 60 * 1000;
    const canResend = !last || last.getTime() < now.getTime() - cooldownMs;

    if (!canResend) return { action: "noop", reason: "cooldown" };

    await tx.stockAlert.update({
      where: { id: activeAlert.id },
      data: {
        lastSentAt: now,
        stockAtAlert: inv.stock,
        threshold,
        // mantenemos isActive=true
      },
    });

    if (rule) {
      await tx.stockCriticalRule.update({
        where: { inventarioId },
        data: { lastNotifiedAt: now },
      });
    }

    await tx.ecommerceNotificacion.create({
      data: {
        id: randomUUID(),
        tipo: "STOCK_CRITICO",
        referenciaTabla: "Inventario",
        referenciaId: inventarioId,
        titulo: `Stock crítico (recordatorio): ${inv.producto.nombre}`,
        detalle: `Stock ${inv.stock} (mínimo ${threshold}).`,
        leido: false,
      },
    });

    return { action: "resent", alertId: activeAlert.id };
  }

  // Si NO está crítico, y hay alerta activa -> resolver
  if (!isCritical && activeAlert) {
    await tx.stockAlert.update({
      where: { id: activeAlert.id },
      data: {
        status: "RESOLVED",
        isActive: false,
        resolvedAt: now,
      },
    });

    return { action: "resolved", alertId: activeAlert.id };
  }

  return { action: "noop" };
}

async function evaluateStockCritical(inventarioId: string) {
  return prisma.$transaction((tx) => evaluateStockCriticalTx(tx, inventarioId));
}

/* ================== CRUD ================== */

// CREATE inventario
export async function createInventario(req: Request, res: Response) {
  try {
    const parsed = inventarioSchema.parse(req.body);
    await assertProductoNoEsFlete(parsed.productoId);

    const data = normalizeInventarioCreate(parsed);

    const nuevo = await prisma.inventario.create({ data });

    // ✅ evaluar stock crítico por si entra con stock/minimo iniciales
    const stockCritical = await evaluateStockCritical(nuevo.id);

    return res.status(201).json({ ...nuevo, stockCritical });
  } catch (e: unknown) {
    if (isZodError(e)) {
      return res.status(400).json({ error: "Validación", issues: e.issues });
    }

    const code = errorCode(e) || prismaCode(e);

    if (code === "PRODUCTO_NOT_FOUND") return res.status(400).json({ error: "productoId no existe" });
    if (code === "PRODUCTO_ES_FLETE")
      return res.status(400).json({ error: "No se puede crear inventario para un flete" });

    if (code === "P2003") return res.status(400).json({ error: "productoId no existe" });
    if (code === "P2002") return res.status(409).json({ error: "Inventario duplicado (productoId o código ya existe)" });

    console.error("Error al crear inventario:", e);
    return res.status(500).json({ error: errorMessage(e, "Error al crear inventario") });
  }
}

// READ ALL (con filtro q en DB)  ✅ AHORA incluye producto.imagenes
export async function getInventarios(req: Request, res: Response) {
  try {
    const productoId = req.query.productoId ? String(req.query.productoId) : undefined;
    const q = String(req.query.q ?? "").trim();

    const whereBase: Record<string, unknown> = {};
    if (productoId) whereBase.productoId = productoId;

    const where =
      q.length > 0
        ? {
            ...whereBase,
            producto: {
              OR: [
                { nombre: { contains: q, mode: "insensitive" as const } },
                { sku: { contains: q, mode: "insensitive" as const } },
              ],
            },
          }
        : whereBase;

    const inventarios = await prisma.inventario.findMany({
      where: where as never,
      include: {
        producto: {
          include: {
            imagenes: { orderBy: { orden: "asc" } }, // ✅ clave
          },
        },
        alerts: {
          where: { isActive: true },
          take: 1,
          orderBy: { openedAt: "desc" },
        },
        criticalRule: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return res.status(200).json(inventarios);
  } catch (e: unknown) {
    console.error("Error al obtener inventarios:", e);
    return res.status(500).json({ error: errorMessage(e, "Error al obtener inventarios") });
  }
}

// READ ONE ✅ también incluye producto.imagenes
export async function getInventarioById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || typeof id !== "string") return res.status(400).json({ error: "ID inválido" });

    const inv = await prisma.inventario.findUnique({
      where: { id },
      include: {
        producto: {
          include: {
            imagenes: { orderBy: { orden: "asc" } }, // ✅ clave
          },
        },
        movimientos: { orderBy: { createdAt: "desc" } },
        criticalRule: true,
        alerts: { orderBy: { openedAt: "desc" }, take: 50 },
      },
    });

    if (!inv) return res.status(404).json({ error: "Inventario no encontrado" });
    return res.status(200).json(inv);
  } catch (e: unknown) {
    console.error("Error al obtener inventario:", e);
    return res.status(500).json({ error: errorMessage(e, "Error al obtener inventario") });
  }
}

// UPDATE (PATCH)
export async function updateInventario(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || typeof id !== "string") return res.status(400).json({ error: "ID inválido" });

    const parsed = inventarioUpdateSchema.parse(req.body);
    const data = normalizeInventarioUpdate(parsed);

    const current = await prisma.inventario.findUnique({
      where: { id },
      select: { productoId: true },
    });
    if (!current) return res.status(404).json({ error: "Inventario no encontrado" });

    await assertProductoNoEsFlete(current.productoId);

    const actualizado = await prisma.inventario.update({
      where: { id },
      data,
    });

    // ✅ si tocaron stock o minimo, re-evaluar
    const touchedStockOrMin = data.stock !== undefined || data.minimo !== undefined;
    const stockCritical = touchedStockOrMin ? await evaluateStockCritical(id) : { action: "noop" };

    return res.status(200).json({ ...actualizado, stockCritical });
  } catch (e: unknown) {
    if (isZodError(e)) {
      return res.status(400).json({ error: "Validación", issues: e.issues });
    }

    const code = errorCode(e) || prismaCode(e);

    if (code === "PRODUCTO_ES_FLETE") return res.status(400).json({ error: "No se puede editar inventario de un flete" });
    if (code === "P2025") return res.status(404).json({ error: "Inventario no encontrado" });
    if (code === "P2002") return res.status(409).json({ error: "Código de inventario ya existe" });

    console.error("Error al actualizar inventario:", e);
    return res.status(500).json({ error: errorMessage(e, "Error al actualizar inventario") });
  }
}

// DELETE
export async function deleteInventario(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || typeof id !== "string") return res.status(400).json({ error: "ID inválido" });

    await prisma.inventario.delete({ where: { id } });
    return res.status(204).send();
  } catch (e: unknown) {
    const code = prismaCode(e);
    console.error("Error al eliminar inventario:", e);

    if (code === "P2025") return res.status(404).json({ error: "Inventario no encontrado" });
    return res.status(500).json({ error: errorMessage(e, "Error al eliminar inventario") });
  }
}

/* ================== STOCK MOVIMIENTOS ================== */

export async function createMovimientoStock(req: Request, res: Response) {
  try {
    const parsed = createMovimientoSchema.parse(req.body);
    const data = normalizeMovimientoBody(parsed);

    const result = await prisma.$transaction(async (tx) => {
      const inv = await tx.inventario.findUnique({
        where: { id: data.inventarioId },
        include: { producto: { select: { tipo: true } } },
      });

      if (!inv) {
        const err: ApiError = new Error("Inventario no encontrado");
        err.code = "INV_NOT_FOUND";
        throw err;
      }

      if (isFleteTipo(inv.producto?.tipo)) {
        const err: ApiError = new Error("No se puede manejar stock para un flete");
        err.code = "PRODUCTO_ES_FLETE";
        throw err;
      }

      let nuevoStock = inv.stock;

      if (data.tipo === "Entrada") nuevoStock = inv.stock + data.cantidad;
      if (data.tipo === "Salida") nuevoStock = inv.stock - data.cantidad;
      if (data.tipo === "Ajuste") nuevoStock = data.cantidad;

      if (nuevoStock < 0) {
        const err: ApiError = new Error("Stock insuficiente");
        err.code = "STOCK_NEGATIVO";
        throw err;
      }

      const mov = await tx.stockMovimiento.create({
        data: {
          inventarioId: data.inventarioId,
          tipo: data.tipo,
          cantidad: data.cantidad,
          nota: data.nota,
        },
      });

      const invUpdated = await tx.inventario.update({
        where: { id: data.inventarioId },
        data: { stock: nuevoStock },
      });

      // ✅ evaluar stock crítico ATÓMICO dentro de la misma tx
      const stockCritical = await evaluateStockCriticalTx(tx, data.inventarioId);

      return { mov, inventario: invUpdated, stockCritical };
    });

    return res.status(201).json(result);
  } catch (e: unknown) {
    if (isZodError(e)) {
      return res.status(400).json({ error: "Validación", issues: e.issues });
    }

    const code = errorCode(e) || prismaCode(e);
    if (code === "INV_NOT_FOUND") return res.status(404).json({ error: "Inventario no encontrado" });
    if (code === "PRODUCTO_ES_FLETE") return res.status(400).json({ error: "No se puede manejar stock para un flete" });
    if (code === "STOCK_NEGATIVO") return res.status(400).json({ error: "Stock insuficiente para realizar la salida" });

    console.error("Error al crear movimiento de stock:", e);
    return res.status(500).json({ error: errorMessage(e, "Error al crear movimiento de stock") });
  }
}

/* ================== IMPORT EXCEL ================== */

function normalizeHeaderKey(k: string) {
  return k.trim().replace(/\s+/g, "").toLowerCase();
}

function normalizeSku(raw: unknown) {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  if (/^SKU-\d+$/i.test(s)) return s.toUpperCase();
  if (/^\d+$/.test(s)) return `SKU-${s}`;
  const m = s.match(/^SKU\D*(\d+)$/i);
  if (m?.[1]) return `SKU-${m[1]}`.toUpperCase();
  return s.toUpperCase();
}

function normalizeInvCode(raw: unknown) {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  if (/^INV-\d+$/i.test(s)) return s.toUpperCase();
  if (/^\d+$/.test(s)) return `INV-${s}`;
  const m = s.match(/^INV\D*(\d+)$/i);
  if (m?.[1]) return `INV-${m[1]}`.toUpperCase();
  return s.toUpperCase();
}

function toInt(raw: unknown, def = 0) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.trunc(n);
}

function toNonNegInt(raw: unknown, def = 0) {
  const n = toInt(raw, def);
  return n < 0 ? def : n;
}

function toNonNegMoney(raw: unknown, def = 0) {
  const n = toInt(raw, def);
  return n < 0 ? def : n;
}

type ImportRow = {
  sku: string;
  codigo: string | null;
  nombre: string;
  tipo: ProductoTipo;
  precio: number;
  stock: number;
  minimo: number;
  fotoUrl: string | null;
};

function parseImportRow(obj: Record<string, any>): ImportRow | { error: string } {
  const sku = normalizeSku(obj.sku);
  const codigo = normalizeInvCode(obj.codigo);
  const nombre = String(obj.nombre ?? "").trim();

  const tipo = mapTipoToPrismaEnum(obj.tipo);

  const precio = toNonNegMoney(obj.precio, 0);
  const stock = toNonNegInt(obj.stock, 0);
  const minimo = toNonNegInt(obj.minimo, 0);

  const fotoUrl = (() => {
    const f = String(obj.fotourl ?? obj.fotoUrl ?? "").trim();
    return f ? f : null;
  })();

  if (!sku) return { error: "sku es obligatorio" };
  if (!nombre) return { error: "nombre es obligatorio" };
  if (!tipo) return { error: `tipo inválido. Valores permitidos: ${PRODUCTO_TIPO_VALUES.join(", ")}` };

  if (!isFleteTipo(tipo) && !codigo) return { error: "codigo es obligatorio para Producto (INV-xxx)" };

  return { sku, codigo, nombre, tipo, precio, stock, minimo, fotoUrl };
}

export async function importInventarioExcel(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ error: "Debes subir un archivo Excel en el campo 'file'." });
  }

  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return res.status(400).json({ error: "El Excel no tiene hojas." });

    const ws = wb.Sheets[sheetName];
    if (!ws) return res.status(400).json({ error: "No se pudo leer la hoja del Excel." });

    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
    if (!rawRows.length) return res.status(400).json({ error: "El Excel está vacío (sin filas)." });

    const normalizedRows = rawRows.map((r) => {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(r)) out[normalizeHeaderKey(k)] = v;
      return out;
    });

    const errores: Array<{ row: number; error: string }> = [];

    let createdProductos = 0;
    let updatedProductos = 0;
    let createdInventarios = 0;
    let updatedInventarios = 0;

    for (let i = 0; i < normalizedRows.length; i++) {
      const excelRowNumber = i + 2;
      const parsed = parseImportRow(normalizedRows[i]);

      if ("error" in parsed) {
        errores.push({ row: excelRowNumber, error: parsed.error });
        continue;
      }

      const row = parsed;

      try {
        const flags = await prisma.$transaction(async (tx) => {
          const existing = await tx.producto.findFirst({
            where: { sku: row.sku },
            select: { id: true },
          });

          const producto = existing
            ? await tx.producto.update({
                where: { id: existing.id },
                data: {
                  sku: row.sku,
                  nombre: row.nombre,
                  tipo: row.tipo,
                  precioGeneral: row.precio,
                  precioConDescto: row.precio,
                  fotoUrl: row.fotoUrl,
                  unidadMedida: "unidad",
                },
              })
            : await tx.producto.create({
                data: {
                  sku: row.sku,
                  nombre: row.nombre,
                  tipo: row.tipo,
                  precioGeneral: row.precio,
                  precioConDescto: row.precio,
                  fotoUrl: row.fotoUrl,
                  unidadMedida: "unidad",
                },
              });

          let invCreated = false;
          let invUpdated = false;
          let invId: string | null = null;

          if (!isFleteTipo(row.tipo)) {
            const invExisting = await tx.inventario.findFirst({
              where: { productoId: producto.id },
              select: { id: true },
            });

            if (invExisting) {
              const updated = await tx.inventario.update({
                where: { id: invExisting.id },
                data: { codigo: row.codigo, stock: row.stock, minimo: row.minimo },
              });
              invUpdated = true;
              invId = updated.id;
            } else {
              const created = await tx.inventario.create({
                data: { productoId: producto.id, codigo: row.codigo, stock: row.stock, minimo: row.minimo },
              });
              invCreated = true;
              invId = created.id;
            }

            // ✅ evaluar stock crítico dentro de tx para que quede consistente
            if (invId) {
              await evaluateStockCriticalTx(tx, invId);
            }
          } else {
            await tx.inventario.deleteMany({ where: { productoId: producto.id } });
          }

          return {
            productoCreated: !existing,
            productoUpdated: !!existing,
            invCreated,
            invUpdated,
            invId,
          };
        });

        if (flags.productoCreated) createdProductos++;
        if (flags.productoUpdated) updatedProductos++;
        if (flags.invCreated) createdInventarios++;
        if (flags.invUpdated) updatedInventarios++;
      } catch (e: any) {
        if (e?.code === "P2002") errores.push({ row: excelRowNumber, error: "Duplicado (SKU o código ya existe)" });
        else if (e?.code === "P2003") errores.push({ row: excelRowNumber, error: "FK inválida (productoId relacionado)" });
        else errores.push({ row: excelRowNumber, error: e?.message || "Error desconocido" });
      }
    }

    return res.status(200).json({
      ok: errores.length === 0,
      message: errores.length === 0 ? "Importación completa." : `Importación completada con ${errores.length} error(es).`,
      total: normalizedRows.length,
      createdProductos,
      updatedProductos,
      createdInventarios,
      updatedInventarios,
      errores,
    });
  } catch (e: any) {
    console.error("Error importInventarioExcel:", e);
    return res.status(500).json({ error: "Error al importar Excel" });
  }
}
