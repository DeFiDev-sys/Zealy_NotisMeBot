import { projectService } from "./project-service";
import { scanService } from "./scan-service";
import { notificationService, escapeHtml } from "./notification-service";
import { questService } from "./quest-service";
import { prisma } from "../database/prisma";
import { createLogger } from "../utils/logger";
import { env } from "../config/env";
import { ConcurrencyLimiter } from "../utils/concurrency-limiter";

const logger = createLogger("scheduler-service");

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

// Tick every 15 seconds; per-project interval is enforced by due check
const TICK_MS = 15_000;

// Concurrency limiter for parallel scans (serializes Zealy network calls via shared browser)
const scanConcurrencyLimiter = new ConcurrencyLimiter(env.MAX_CONCURRENT_SCANS);

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

    // Filter: only notify about quests discovered at least 0.2s ago
    // This ensures tasks are "settled" in the system before notification
    const minDiscoveryAgeMs = 200;
    const now = new Date();
    const recentlyDiscovered = result.newQuests.filter(
      (quest) => now.getTime() - (quest.detectedAt?.getTime() ?? now.getTime()) >= minDiscoveryAgeMs
    );
    const skippedCount = result.newQuests.length - recentlyDiscovered.length;

    if (recentlyDiscovered.length > 0) {
      const owner = await prisma.telegramOwner.findFirst();
      if (owner) {
        if (shouldNotify) {
          await notificationService.sendNewQuestsNotification(
            owner.chatId,
            project.projectName,
            project.projectSlug,
            recentlyDiscovered
          );

          for (const quest of recentlyDiscovered) {
            await questService.markNotificationSent(quest.questId);
          }

          // Log that some quests were too recent and were skipped
          if (skippedCount > 0) {
            await notificationService.logNotification(
              project.id,
              `New quests: ${recentlyDiscovered.map((q) => q.questName).join(", ")} (${skippedCount} delayed)`,
              "SENT"
            );
          } else {
            await notificationService.logNotification(
              project.id,
              `New quests: ${recentlyDiscovered.map((q) => q.questName).join(", ")}`,
              "SENT"
            );
          }
        } else {
          // Initial scan with notifyOnInitialScan = false: mark as sent but don't notify
          for (const quest of recentlyDiscovered) {
            await questService.markNotificationSent(quest.questId);
          }
          logger.info({ projectId: project.id, projectName: project.projectName }, "Initial scan completed, notifications skipped (notifyOnInitialScan=false)");
        }
      } else {
        logger.warn({ projectId: project.id }, "No Telegram owner found; new quests saved but not notified");
      }
    } else {
      logger.debug({ projectId: project.id }, "No recent new quests to notify (all discovered within 200ms)");
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
    return;
  }

  const totalNew = scannedProjects.reduce((sum, r) => sum + r.newQuests, 0);
  const totalQuests = scannedProjects.reduce((sum, r) => sum + r.questsFound, 0);
  const hasErrors = scannedProjects.some(r => r.error);

  if (totalNew === 0 && !hasErrors) {
    return;
  }

  const lines = [
    "📊 <b>Scheduled Scan Complete</b>",
    `⏰ ${new Date().toLocaleTimeString()}`,
    ``,
    `📍 ${scannedProjects.length} Projects Scanned`,
    `📊 ${totalQuests} Quests Found`,
    `🚀 ${totalNew} New`,
  ];

  const message = lines.join("\n");
  const safeMessage = escapeHtml(message);

  try {
    await notificationService.sendCycleSummaryNotification(owner.chatId, safeMessage);
  } catch (error) {
    logger.error({ error }, "Failed to send cycle summary notification");
  }
}

function isDue(project: { lastCheckedAt: Date | null; scanIntervalMinutes: number }): boolean {
  if (!project.lastCheckedAt) return true;
  const intervalMs = project.scanIntervalMinutes * 60 * 1000;
  return Date.now() - new Date(project.lastCheckedAt).getTime() >= intervalMs;
}

function buildProcessArgs(project: {
  id: string;
  projectName: string;
  projectSlug: string;
  notifyOnInitialScan: boolean;
  questCount: number;
}) {
  return {
    id: project.id,
    projectName: project.projectName,
    projectSlug: project.projectSlug,
    notifyOnInitialScan: project.notifyOnInitialScan,
    questCount: project.questCount,
  };
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

    const dueProjects = projects.filter(p => p.isActive && isDue(p));
    const skippedProjects = projects.filter(p => !p.isActive || !isDue(p));

    logger.debug({
      activeProjects: projects.filter(p => p.isActive).length,
      dueProjects: dueProjects.length,
      skippedProjects: skippedProjects.length,
      totalProjects: projects.length
    }, "Scheduler cycle started");

    // Add skipped projects to results with appropriate status
    for (const project of skippedProjects) {
      results.push({
        projectId: project.id,
        projectName: project.projectName,
        projectSlug: project.projectSlug,
        scanned: false,
        questsFound: 0,
        newQuests: 0,
        error: project.isActive ? "Not due" : "Paused"
      });
    }

    if (dueProjects.length === 0) {
      logger.debug("No projects due for scan");
      await sendCycleSummary(results);
      return;
    }

    // Stagger launches to avoid burst requests to Zealy
    const staggerMs = Math.min(5000, Math.max(2000, 3000 / Math.max(1, dueProjects.length)));

    const scanPromises = dueProjects.map(async (project, index) => {
      // Stagger start: each project waits index * staggerMs before starting
      if (index > 0) {
        const delay = index * staggerMs + Math.floor(Math.random() * 2000); // add jitter
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      return scanConcurrencyLimiter.run(async () => {
        logger.info({ projectId: project.id, projectName: project.projectName }, "Running scheduled scan");
        return processProject(buildProcessArgs(project));
      });
    });

    const settled = await Promise.allSettled(scanPromises);

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
      } else {
        logger.error({ error: outcome.reason }, "Scan promise rejected");
        results.push({
          projectId: "unknown",
          projectName: "unknown",
          projectSlug: "unknown",
          scanned: true,
          questsFound: 0,
          newQuests: 0,
          error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
        });
      }
    }

    const duration = Date.now() - cycleStart;
    logger.info({ duration, projectsScanned: results.filter(r => r.scanned).length }, "Scheduler cycle completed");

    // Send summary notification (results are sorted by project name for consistency)
    const sortedResults = [...results].sort((a, b) => a.projectName.localeCompare(b.projectName));
    await sendCycleSummary(sortedResults);
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