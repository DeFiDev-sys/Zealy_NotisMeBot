const {PrismaClient} = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const projects = await p.project.findMany({ include: { scan: true } });
  
  for (const proj of projects) {
    const lastChecked = proj.lastCheckedAt ? new Date(proj.lastCheckedAt) : null;
    const scanStarted = proj.scan ? new Date(proj.scan.startedAt) : null;
    const scanCompleted = proj.scan ? new Date(proj.scan.completedAt) : null;
    
    console.log(`Project: ${proj.projectName}`);
    console.log(`  lastCheckedAt: ${lastChecked?.toISOString()}`);
    console.log(`  scan.startedAt: ${scanStarted?.toISOString()}`);
    console.log(`  scan.completedAt: ${scanCompleted?.toISOString()}`);
    console.log(`  scan.status: ${proj.scan?.status}`);
    console.log(`  diff lastChecked - startedAt (min): ${lastChecked && scanStarted ? Math.floor((lastChecked.getTime() - scanStarted.getTime()) / 60000) : 'N/A'}`);
    console.log("");
  }
  
  await p.$disconnect();
}

main().catch(console.error);