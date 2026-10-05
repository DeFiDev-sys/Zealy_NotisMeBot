const {PrismaClient} = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const projectId = 'cmuuff4130004vicifsjhh5iy'; // Propbase
  
  const before = await p.scan.findUnique({ where: { projectId } });
  console.log('Before upsert - startedAt:', before?.startedAt);
  
  await p.scan.upsert({
    where: { projectId },
    create: { projectId, status: "PENDING", questsFound: 0, newQuestsFound: 0, startedAt: new Date() },
    update: { status: "PENDING", questsFound: 0, newQuestsFound: 0, startedAt: new Date(), completedAt: null, errorMessage: null },
  });
  
  const after = await p.scan.findUnique({ where: { projectId } });
  console.log('After upsert - startedAt:', after?.startedAt);
  
  await p.$disconnect();
}

main().catch(console.error);