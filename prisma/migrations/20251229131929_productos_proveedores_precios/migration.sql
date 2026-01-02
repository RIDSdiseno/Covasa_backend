-- CreateEnum
CREATE TYPE "TipoMovimientoStock" AS ENUM ('Entrada', 'Salida', 'Ajuste');

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rut" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "contacto" TEXT,
    "direccion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL,
    "sku" TEXT,
    "nombre" TEXT NOT NULL,
    "unidadMedida" TEXT NOT NULL DEFAULT 'unidad',
    "fotoUrl" TEXT,
    "precioConDescto" INTEGER NOT NULL DEFAULT 0,
    "precioGeneral" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecioProveedor" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "precio" INTEGER NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'CLP',
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecioProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventario" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "codigo" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minimo" INTEGER NOT NULL DEFAULT 0,
    "ubicacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovimiento" (
    "id" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "tipo" "TipoMovimientoStock" NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_nombre_key" ON "Proveedor"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_sku_key" ON "Producto"("sku");

-- CreateIndex
CREATE INDEX "Producto_nombre_idx" ON "Producto"("nombre");

-- CreateIndex
CREATE INDEX "PrecioProveedor_proveedorId_idx" ON "PrecioProveedor"("proveedorId");

-- CreateIndex
CREATE INDEX "PrecioProveedor_productoId_idx" ON "PrecioProveedor"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "PrecioProveedor_productoId_proveedorId_key" ON "PrecioProveedor"("productoId", "proveedorId");

-- CreateIndex
CREATE INDEX "Inventario_productoId_idx" ON "Inventario"("productoId");

-- CreateIndex
CREATE INDEX "StockMovimiento_inventarioId_idx" ON "StockMovimiento"("inventarioId");

-- CreateIndex
CREATE INDEX "Cliente_rut_idx" ON "Cliente"("rut");

-- CreateIndex
CREATE INDEX "Cliente_nombre_idx" ON "Cliente"("nombre");

-- AddForeignKey
ALTER TABLE "PrecioProveedor" ADD CONSTRAINT "PrecioProveedor_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecioProveedor" ADD CONSTRAINT "PrecioProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventario" ADD CONSTRAINT "Inventario_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovimiento" ADD CONSTRAINT "StockMovimiento_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "Inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
