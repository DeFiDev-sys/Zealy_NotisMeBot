/**
 * Check lynxcap quests and notification status
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find lynxcap project
  const project = await prisma.project.findUnique({
    where: { projectSlug: "lynxcap" },
    include: {
      quests: {
        orderBy: { firstDetectedAt: "desc" },
        take: 20,
      },
      scan: true,
      notifications: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!project) {
    console.log("Project lynxcap not found");
    return;
  }

  console.log("=== PROJECT ===");
  console.log(JSON.stringify({
    id: project.id,
    projectName: project.projectName,
    projectSlug: project.projectSlug,
    isActive: project.isActive,
    notifyOnInitialScan: project.notifyOnInitialScan,
    scanIntervalMinutes: project.scanIntervalMinutes,
    questCount: project.quests.length,
    lastCheckedAt: project.lastCheckedAt,
  }, null, 2));

  console.log("\n=== QUESTS (last 20) ===");
  console.log(JSON.stringify(project.quests.map(q => ({
    questId: q.questId,
    questName: q.questName,
    firstDetectedAt: q.firstDetectedAt,
    notificationSent: q.notificationSent,
    questUrl: q.questUrl,
  })), null, 2));

  console.log("\n=== LAST SCAN ===");
  console.log(JSON.stringify(project.scan, null, 2));

  console.log("\n=== RECENT NOTIFICATIONS ===");
  console.log(JSON.stringify(project.notifications, null, 2));
}

main().finally(() => prisma.$disconnect());