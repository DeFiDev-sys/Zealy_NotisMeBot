const {PrismaClient} = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const indexes = await p.$queryRawUnsafe('PRAGMA index_list("Scan")');
  console.log('Indexes on Scan:', indexes);
  
  const schema = await p.$queryRawUnsafe("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='Scan'");
  console.log('Index SQL:', schema);
  
  await p.$disconnect();
}

main().catch(console.error);