import { prisma } from "../database/prisma";
import { ScanResult } from "../types";
import { ZealyQuestScraper } from "../scraper/zealy-scraper";
import { questService } from "./quest-service";
import { projectService } from "./project-service";
import { createLogger } from "../utils/logger";

const logger = createLogger("scan-service");

const scanLocks = new Map<string, boolean>();

export interface ScanService {
  scanProject(projectId: string): Promise<ScanResult>;
  isScanning(projectId: string): boolean;
}

async function processQuests(quests: ScanResult["quests"], projectId: string) {
  const newQuests: ScanResult["quests"] = [];

  for (const quest of quests) {
    const existing = await questService.findByQuestId(quest.questId);

    if (existing) {
      await questService.updateLastSeen(quest.questId);
    } else {
      const created = await questService.createMany([quest], projectId);
      if (created.length > 0) {
        newQuests.push(...created);
      }
    }
  }

  return newQuests;
}

export const scanService: ScanService = {
  isScanning(projectId: string): boolean {
    return scanLocks.get(projectId) === true;
  },

  async scanProject(projectId: string): Promise<ScanResult> {
    if (scanLocks.get(projectId)) {
      throw new Error("Scan already in progress for this project");
    }

    const project = await projectService.findById(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    if (!project.isActive) {
      throw new Error("Project is paused");
    }

    scanLocks.set(projectId, true);

    const scan = await prisma.scan.create({
      data: {
        projectId,
        status: "PENDING",
        questsFound: 0,
        newQuestsFound: 0,
      },
    });

    const previousQuestCount = await questService.countByProjectId(projectId);
    const scraper = new ZealyQuestScraper();

    try {
      const result = await scraper.scanProject(
        project.url,
        project.projectSlug,
        project.projectName,
        previousQuestCount
      );

      await scraper.close();

      let newQuests: typeof result.quests = [];
      let newQuestsFound = 0;

      if (result.status === "completed") {
        const newQuestObjects = await processQuests(result.quests, projectId);
        newQuests = newQuestObjects;
        newQuestsFound = newQuestObjects.length;
      }

      const finalResult: ScanResult = {
        ...result,
        newQuests,
        newQuestsFound,
      };

      await prisma.scan.update({
        where: { id: scan.id },
        data: {
          completedAt: new Date(),
          status: result.status === "suspicious" ? "SUSPICIOUS" : "COMPLETED",
          questsFound: result.questsFound,
          newQuestsFound,
          errorMessage: result.errorMessage,
        },
      });

      await projectService.updateLastChecked(projectId);

      logger.info(
        { projectId, questsFound: result.questsFound, newQuestsFound },
        "Scan completed"
      );

      return finalResult;
    } catch (error) {
      await scraper.close();

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await prisma.scan.update({
        where: { id: scan.id },
        data: {
          completedAt: new Date(),
          status: "FAILED",
          errorMessage,
        },
      });

      logger.error({ projectId, error: errorMessage }, "Scan failed");
      throw error;
    } finally {
      scanLocks.delete(projectId);
    }
  },
};