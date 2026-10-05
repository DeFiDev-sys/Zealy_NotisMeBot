const {PrismaClient} = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const projects = await p.project.findMany({ include: { scan: true } });
  
  for (const proj of projects) {
    const lastChecked = proj.lastCheckedAt ? new Date(proj.lastCheckedAt) : null;
    const scanCompleted = proj.scan?.completedAt ? new Date(proj.scan.completedAt) : null;
    const scanStarted = proj.scan?.startedAt ? new Date(proj.scan.startedAt) : null;
    
    const scanTime = scanCompleted ?? scanStarted;
    const lastScanAt = (scanTime && lastChecked) 
      ? (scanTime > lastChecked ? scanTime : lastChecked)
      : (scanTime ?? lastChecked);
    
    console.log(`Project: ${proj.projectName}`);
    console.log(`  lastCheckedAt: ${lastChecked?.toISOString()}`);
    console.log(`  scan.completedAt: ${scanCompleted?.toISOString()}`);
    console.log(`  scan.startedAt: ${scanStarted?.toISOString()}`);
    console.log(`  computed lastScanAt: ${lastScanAt?.toISOString()}`);
    console.log(`  diff (min): ${lastScanAt ? Math.floor((Date.now() - new Date(lastScanAt).getTime()) / 60000) : 'N/A'}`);
    console.log("");
  }
  
  await p.$disconnect();
}

main().catch(console.error);