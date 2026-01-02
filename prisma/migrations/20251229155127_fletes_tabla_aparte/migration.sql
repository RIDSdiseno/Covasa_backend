/*
  Warnings:

  - The values [Flete] on the enum `ProductoTipo` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `FleteDetalle` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ProductoTipo_new" AS ENUM ('Producto', 'Servicio');
ALTER TABLE "public"."Producto" ALTER COLUMN "tipo" DROP DEFAULT;
ALTER TABLE "Producto" ALTER COLUMN "tipo" TYPE "ProductoTipo_new" USING ("tipo"::text::"ProductoTipo_new");
ALTER TYPE "ProductoTipo" RENAME TO "ProductoTipo_old";
ALTER TYPE "ProductoTipo_new" RENAME TO "ProductoTipo";
DROP TYPE "public"."ProductoTipo_old";
ALTER TABLE "Producto" ALTER COLUMN "tipo" SET DEFAULT 'Producto';
COMMIT;

-- DropForeignKey
ALTER TABLE "FleteDetalle" DROP CONSTRAINT "FleteDetalle_productoId_fkey";

-- DropTable
DROP TABLE "FleteDetalle";

-- CreateTable
CREATE TABLE "FleteTarifa" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "zona" TEXT,
    "destino" TEXT,
    "precio" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "observacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleteTarifa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FleteTarifa_nombre_idx" ON "FleteTarifa"("nombre");

-- CreateIndex
CREATE INDEX "FleteTarifa_zona_idx" ON "FleteTarifa"("zona");

-- CreateIndex
CREATE INDEX "FleteTarifa_activo_idx" ON "FleteTarifa"("activo");
