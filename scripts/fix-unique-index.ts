const {PrismaClient} = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  // First, clean up duplicates - keep only latest per project
  const deleted = await p.$executeRawUnsafe(`
    DELETE FROM "Scan" WHERE "id" NOT IN (
      SELECT "id" FROM "Scan" s 
      WHERE s."startedAt" = (
        SELECT MAX("startedAt") FROM "Scan" WHERE "projectId" = s."projectId"
      )
      GROUP BY "projectId"
    )
  `);
  console.log(`Deleted ${deleted} duplicate scan rows`);
  
  // Now create the unique index
  try {
    await p.$executeRawUnsafe('DROP INDEX IF EXISTS "Scan_projectId_idx"');
    console.log('Dropped non-unique index');
    
    await p.$executeRawUnsafe('CREATE UNIQUE INDEX "Scan_projectId_key" ON "Scan"("projectId")');
    console.log('Created unique index');
  } catch (e) {
    console.error('Error creating unique index:', e);
  }
  
  // Verify
  const indexes = await p.$queryRawUnsafe('PRAGMA index_list("Scan")');
  console.log('Indexes on Scan:', indexes);
  
  await p.$disconnect();
}

main().catch(console.error);