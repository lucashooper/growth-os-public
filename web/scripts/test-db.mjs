import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL || "";
const safe = url.replace(/:\/\/[^@]+@/, "://***@");
console.log("Testing", safe);

const prisma = new PrismaClient();
try {
  await prisma.$queryRaw`SELECT 1 as ok`;
  const tables = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY 1
  `;
  console.log("OK connected");
  console.log(
    "tables",
    tables.map((t) => t.table_name).join(", "),
  );
} catch (e) {
  console.error("FAIL", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
