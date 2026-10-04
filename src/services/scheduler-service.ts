import { projectService } from "./project-service";
import { scanService } from "./scan-service";
import { notificationService } from "./notification-service";
import { questService } from "./quest-service";
import { prisma } from "../database/prisma";
import { createLogger } from "../utils/logger";
import { env } from "../config/env";

const logger = createLogger("scheduler-service");

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

export interface SchedulerService {
  start(): void;
  stop(): void;
  triggerScan(projectId: string): Promise<void>;
}

async function processProject(project: {
  id: string;
  projectName: string;
  projectSlug: string;
  notifyOnInitialScan: boolean;
}) {
  if (scanService.isScanning(project.id)) {
    logger.debug({ projectId: project.id }, "Scan already in progress, skipping");
    return;
  }

  try {
    const result = await scanService.scanProject(project.id);

    if (result.newQuests.length > 0) {
      const owner = await prisma.telegramOwner.findFirst();
      if (owner) {
        await notificationService.sendNewQuestsNotification(
          owner.chatId,
          project.projectName,
          project.projectSlug,
          result.newQuests
        );

        for (const quest of result.newQuests) {
          await questService.markNotificationSent(quest.questId);
        }

        await notificationService.logNotification(
          project.id,
          `New quests: ${result.newQuests.map((q) => q.questName).join(", ")}`,
          "SENT"
        );
      }
    }
  } catch (error) {
    logger.error({ error, projectId: project.id }, "Failed to process project");

    const owner = await prisma.telegramOwner.findFirst();
    if (owner) {
      await notificationService.logNotification(
        project.id,
        `Scan failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "FAILED",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
}

async function runScheduledScans() {
  if (isRunning) {
    logger.debug("Scheduler already running, skipping cycle");
    return;
  }

  isRunning = true;

  try {
    const projects = await projectService.findAll();
    const now = new Date();

    for (const project of projects) {
      if (!project.isActive) continue;

      const lastChecked = project.lastCheckedAt ? new Date(project.lastCheckedAt) : null;
      const intervalMs = project.scanIntervalMinutes * 60 * 1000;

      if (!lastChecked || now.getTime() - lastChecked.getTime() >= intervalMs) {
        logger.info({ projectId: project.id, projectName: project.projectName }, "Running scheduled scan");
        await processProject(project);
      }
    }
  } catch (error) {
    logger.error({ error }, "Scheduler cycle failed");
  } finally {
    isRunning = false;
  }
}

export const schedulerService: SchedulerService = {
  start() {
    if (schedulerInterval) {
      logger.warn("Scheduler already started");
      return;
    }

    logger.info(`Starting scheduler with ${env.DEFAULT_SCAN_INTERVAL} minute interval`);

    runScheduledScans();

    schedulerInterval = setInterval(runScheduledScans, env.DEFAULT_SCAN_INTERVAL * 60 * 1000);
  },

  stop() {
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
      logger.info("Scheduler stopped");
    }
  },

  async triggerScan(projectId: string) {
    const project = await projectService.findById(projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    await processProject(project);
  },
};