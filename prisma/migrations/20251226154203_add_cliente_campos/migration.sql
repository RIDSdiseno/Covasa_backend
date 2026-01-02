-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "ciudad" TEXT,
ADD COLUMN     "comuna" TEXT,
ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "personaContacto" TEXT,
ADD COLUMN     "region" TEXT,
ALTER COLUMN "rut" DROP NOT NULL;
