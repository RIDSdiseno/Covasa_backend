import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("Falta DATABASE_URL en el entorno (.env).");
}

const pool = new Pool({
  connectionString: url,
});

export const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});
