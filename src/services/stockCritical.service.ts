import { PrismaClient, Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

// Evalúa stock crítico para 1 inventario y:
// - crea alerta OPEN si stock <= threshold y no existe OPEN
// - resuelve alerta OPEN si stock > threshold
export async function evaluateStockCriticalTx(tx: Tx, inventarioId: string) {
  const inv = await tx.inventario.findUnique({
    where: { id: inventarioId },
    select: { id: true, stock: true, minimo: true },
  })
  if (!inv) return

  const threshold = inv.minimo ?? 0
  const isCritical = inv.stock <= threshold

  const active = await tx.stockAlert.findFirst({
    where: { inventarioId, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  })

  if (isCritical) {
    if (active) return
    await tx.stockAlert.create({
      data: {
        inventarioId,
        threshold,
        stockAtAlert: inv.stock,
        status: 'OPEN',
        openedAt: new Date(),
      },
    })
    return
  }

  // no crítico
  if (!active) return
  await tx.stockAlert.update({
    where: { id: active.id },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  })
}

// Helper por si quieres evaluar varios inventarios (ej import excel)
export async function evaluateManyStockCriticalTx(tx: Tx, inventarioIds: string[]) {
  for (const id of inventarioIds) {
    await evaluateStockCriticalTx(tx, id)
  }
}
