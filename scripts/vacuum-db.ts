const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Running WAL checkpoint (TRUNCATE)...");
  await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  console.log("Running VACUUM...");
  await prisma.$executeRawUnsafe("VACUUM");
  console.log("Database vacuum completed.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});