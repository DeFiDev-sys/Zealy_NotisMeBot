const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Clean up existing Scan rows: keep only the latest scan per project
  const deletedScans = await prisma.$executeRawUnsafe(`
    DELETE FROM "Scan" WHERE "id" NOT IN (
      SELECT "id" FROM "Scan" s 
      WHERE s."startedAt" = (
        SELECT MAX("startedAt") FROM "Scan" WHERE "projectId" = s."projectId"
      )
      GROUP BY "projectId"
    )
  `);
  console.log(`Deleted ${deletedScans} duplicate scan rows`);

  // Clean up NotificationLog: keep only the most recent 50 per project
  const deletedLogs = await prisma.$executeRawUnsafe(`
    DELETE FROM "NotificationLog" WHERE "id" NOT IN (
      SELECT "id" FROM (
        SELECT "id", ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt" DESC) as rn
        FROM "NotificationLog"
      ) WHERE rn <= 50
    )
  `);
  console.log(`Deleted ${deletedLogs} excess notification log rows`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});