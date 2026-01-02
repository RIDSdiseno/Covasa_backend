-- CreateEnum
CREATE TYPE "ProductoTipo" AS ENUM ('Producto', 'Flete');

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "tipo" "ProductoTipo" NOT NULL DEFAULT 'Producto';

-- CreateTable
CREATE TABLE "FleteDetalle" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "zona" TEXT,
    "observacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleteDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportLote" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "archivoNombre" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Procesado',
    "totalFilas" INTEGER NOT NULL DEFAULT 0,
    "filasOk" INTEGER NOT NULL DEFAULT 0,
    "filasError" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportFila" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "nroFila" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportFila_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FleteDetalle_productoId_key" ON "FleteDetalle"("productoId");

-- CreateIndex
CREATE INDEX "FleteDetalle_destino_idx" ON "FleteDetalle"("destino");

-- CreateIndex
CREATE INDEX "ImportFila_loteId_idx" ON "ImportFila"("loteId");

-- CreateIndex
CREATE INDEX "Producto_tipo_idx" ON "Producto"("tipo");

-- AddForeignKey
ALTER TABLE "FleteDetalle" ADD CONSTRAINT "FleteDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFila" ADD CONSTRAINT "ImportFila_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "ImportLote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
