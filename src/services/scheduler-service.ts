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

// Tick every 15 seconds; per-project interval is enforced by due check
const TICK_MS = 15_000;

export interface SchedulerService {
  start(): void;
  stop(): void;
  triggerScan(projectId: string): Promise<void>;
}

interface ScanResultSummary {
  projectId: string;
  projectName: string;
  projectSlug: string;
  scanned: boolean;
  questsFound: number;
  newQuests: number;
  error?: string;
}

async function processProject(project: {
  id: string;
  projectName: string;
  projectSlug: string;
  notifyOnInitialScan: boolean;
  questCount: number;
}): Promise<ScanResultSummary> {
  if (scanService.isScanning(project.id)) {
    logger.debug({ projectId: project.id }, "Scan already in progress, skipping");
    return { projectId: project.id, projectName: project.projectName, projectSlug: project.projectSlug, scanned: false, questsFound: 0, newQuests: 0, error: "Already scanning" };
  }

  const timeoutMs = 120000;
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("Scan timeout after 2 minutes")), timeoutMs);
  });

  try {
    const result = await Promise.race([scanService.scanProject(project.id), timeoutPromise]);

    const isInitialScan = project.questCount === 0;
    const shouldNotify = !isInitialScan || project.notifyOnInitialScan;

    if (result.newQuests.length > 0) {
      const owner = await prisma.telegramOwner.findFirst();
      if (owner) {
        if (shouldNotify) {
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
        } else {
          // Initial scan with notifyOnInitialScan = false: mark as sent but don't notify
          for (const quest of result.newQuests) {
            await questService.markNotificationSent(quest.questId);
          }
          logger.info({ projectId: project.id, projectName: project.projectName }, "Initial scan completed, notifications skipped (notifyOnInitialScan=false)");
        }
      } else {
        logger.warn({ projectId: project.id }, "No Telegram owner found; new quests saved but not notified");
      }
    }

    return { projectId: project.id, projectName: project.projectName, projectSlug: project.projectSlug, scanned: true, questsFound: result.questsFound, newQuests: result.newQuestsFound };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage, projectId: project.id }, "Failed to process project");

    const owner = await prisma.telegramOwner.findFirst();
    if (owner) {
      await notificationService.logNotification(
        project.id,
        `Scan failed: ${errorMessage}`,
        "FAILED",
        errorMessage
      );
    }

    return { projectId: project.id, projectName: project.projectName, projectSlug: project.projectSlug, scanned: true, questsFound: 0, newQuests: 0, error: errorMessage };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function sendCycleSummary(results: ScanResultSummary[]) {
  const owner = await prisma.telegramOwner.findFirst();
  if (!owner) return;

  const scannedProjects = results.filter(r => r.scanned);

  if (scannedProjects.length === 0) {
    return; // No projects scanned, no summary needed
  }

  const totalNew = scannedProjects.reduce((sum, r) => sum + r.newQuests, 0);
  // Only count real errors: scanned projects with an error (exclude "Already scanning", "Paused", "Not due")
  const hasErrors = scannedProjects.some(r => r.error);

  // Stay quiet if nothing new and no errors
  if (totalNew === 0 && !hasErrors) {
    return;
  }

  const totalQuests = scannedProjects.reduce((sum, r) => sum + r.questsFound, 0);

  const lines = [
    `📊 <b>Scheduled Scan Complete</b>`,
    `⏰ ${new Date().toLocaleTimeString()}`,
    ``,
    `Projects Scanned: ${scannedProjects.length}`,
    `Total Quests Found: ${totalQuests}`,
    `Total New Quests: ${totalNew}`,
    ``,
  ];

  for (const r of scannedProjects) {
    const status = r.error ? "❌" : (r.newQuests > 0 ? "🔔" : "✅");
    lines.push(`${status} ${r.projectName}: ${r.questsFound} quests, ${r.newQuests} new${r.error ? ` (${r.error})` : ""}`);
  }

  if (hasErrors) {
    lines.push(``, `⚠ Some scans had errors - check logs`);
  }

  const message = lines.join("\n");

  try {
    await notificationService.sendCycleSummaryNotification(owner.chatId, message);
  } catch (error) {
    logger.error({ error }, "Failed to send cycle summary notification");
  }
}

async function runScheduledScans() {
  if (isRunning) {
    logger.debug("Scheduler already running, skipping cycle");
    return;
  }

  isRunning = true;
  const cycleStart = Date.now();
  const results: ScanResultSummary[] = [];

  try {
    const projects = await projectService.findAll();
    const now = new Date();

    logger.debug({ activeProjects: projects.filter(p => p.isActive).length, totalProjects: projects.length }, "Scheduler cycle started");

    for (const project of projects) {
      if (!project.isActive) {
        results.push({ projectId: project.id, projectName: project.projectName, projectSlug: project.projectSlug, scanned: false, questsFound: 0, newQuests: 0, error: "Paused" });
        continue;
      }

      const lastChecked = project.lastCheckedAt ? new Date(project.lastCheckedAt) : null;
      const intervalMs = project.scanIntervalMinutes * 60 * 1000;
      const timeSinceLastCheck = lastChecked ? now.getTime() - lastChecked.getTime() : null;

      logger.debug({ projectId: project.id, projectName: project.projectName, intervalMs, timeSinceLastCheck, lastChecked }, "Checking if project due for scan");

      if (!lastChecked || now.getTime() - lastChecked.getTime() >= intervalMs) {
        logger.info({ projectId: project.id, projectName: project.projectName }, "Running scheduled scan");
        const result = await processProject({
          id: project.id,
          projectName: project.projectName,
          projectSlug: project.projectSlug,
          notifyOnInitialScan: project.notifyOnInitialScan,
          questCount: project.questCount,
        });
        results.push(result);
      } else {
        logger.debug({ projectId: project.id, projectName: project.projectName }, "Project not due yet");
        results.push({ projectId: project.id, projectName: project.projectName, projectSlug: project.projectSlug, scanned: false, questsFound: 0, newQuests: 0, error: "Not due" });
      }
    }

    const duration = Date.now() - cycleStart;
    logger.info({ duration, projectsScanned: results.filter(r => r.scanned).length }, "Scheduler cycle completed");

    // Send summary notification
    await sendCycleSummary(results);
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

    logger.info(`Starting scheduler with ${TICK_MS / 1000}s tick interval (per-project scan interval enforced separately)`);

    runScheduledScans();

    schedulerInterval = setInterval(runScheduledScans, TICK_MS);
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
    await processProject({
      id: project.id,
      projectName: project.projectName,
      projectSlug: project.projectSlug,
      notifyOnInitialScan: project.notifyOnInitialScan,
      questCount: project.questCount,
    });
  },
};