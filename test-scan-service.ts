import { PrismaClient } from "@prisma/client";
import { scanService } from "./src/services/scan-service";

const prisma = new PrismaClient();

async function main() {
  // Find lynxcap project
  const project = await prisma.project.findUnique({
    where: { projectSlug: "lynxcap" },
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
    url: project.url,
  }, null, 2));

  console.log("\n=== STARTING SCAN ===");
  const result = await scanService.scanProject(project.id);

  console.log("\n=== SCAN RESULT ===");
  console.log(JSON.stringify({
    questsFound: result.questsFound,
    newQuestsFound: result.newQuestsFound,
    status: result.status,
    errorMessage: result.errorMessage,
    quests: result.quests.map(q => ({
      questId: q.questId,
      questName: q.questName,
      questUrl: q.questUrl,
      reward: q.reward,
    })),
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);