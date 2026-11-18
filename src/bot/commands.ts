import { Telegraf, Context, Markup } from "telegraf";
import { projectService } from "../services/project-service";
import { scanService } from "../services/scan-service";
import { ownerService } from "../services/owner-service";
import { notificationService, escapeHtml } from "../services/notification-service";
import { schedulerService } from "../services/scheduler-service";
import { prisma } from "../database/prisma";
import { env, isOwner } from "../config/env";
import { createLogger } from "../utils/logger";

const logger = createLogger("bot-commands");

function getCommandArgs(ctx: Context): string[] {
  if (!ctx.message || !("text" in ctx.message)) return [];
  return ctx.message.text.split(" ").slice(1);
}

function getCallbackData(ctx: Context): string | undefined {
  if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) return undefined;
  return ctx.callbackQuery.data;
}

export function registerCommands(bot: Telegraf<Context>) {
  bot.command("start", handleStart);
  bot.command("help", handleHelp);
  bot.command("status", handleStatus);
  bot.command("projects", handleProjects);
  bot.command("addproject", handleAddProject);
  bot.command("scan", handleScan);
  bot.command("scanall", handleScanAll);
  bot.command("pause", handlePause);
  bot.command("resume", handleResume);
  bot.command("remove", handleRemove);
  bot.command("scheduler", handleScheduler);

  bot.action(/confirm_delete:.*/, handleConfirmDelete);
  bot.action("cancel_delete", handleCancelDelete);
}

async function handleStart(ctx: Context) {
  const chatId = String(ctx.chat?.id);
  const username = ctx.from?.username;
  const firstName = ctx.from?.first_name;

  if (!isOwner(chatId)) {
    await ctx.reply("⛔ This bot is private.");
    return;
  }

  await ownerService.upsert(chatId, username, firstName);

  await ctx.reply(
    "🚀 <b>Welcome to Zealy Quest Tracker!</b>\n\n" +
      "Your Telegram notifications are connected.\n\n" +
      "Use /help to see available commands.",
    { parse_mode: "HTML" }
  );
}

async function handleHelp(ctx: Context) {
  const chatId = String(ctx.chat?.id);

  if (!isOwner(chatId)) {
    await ctx.reply("⛔ Unauthorized.");
    return;
  }

  await ctx.reply(
    "📋 <b>Available Commands</b>\n\n" +
      "<b>Project Management:</b>\n" +
      "/addproject <URL> - Add a Zealy questboard\n" +
      "/projects - List all tracked projects\n" +
      "/pause <slug> - Pause monitoring\n" +
      "/resume <slug> - Resume monitoring\n" +
      "/remove <slug> - Remove a project\n\n" +
      "<b>Scanning:</b>\n" +
      "/scan - Scan all active projects (respects interval)\n" +
      "/scan <slug> - Scan specific project\n" +
      "/scanall - Force scan ALL projects (bypasses interval)\n\n" +
      "<b>Status:</b>\n" +
      "/status - Show bot status\n" +
      "/scheduler - Show scheduler status & next scans\n" +
      "/help - Show this help message",
    { parse_mode: "HTML" }
  );
}

async function handleStatus(ctx: Context) {
  const chatId = String(ctx.chat?.id);

  if (!isOwner(chatId)) {
    await ctx.reply("⛔ Unauthorized.");
    return;
  }

  const projects = await projectService.findAll();
  const totalQuests = await prisma.quest.count();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const newToday = await prisma.quest.count({
    where: { firstDetectedAt: { gte: today } },
  });

  const lastScan = await prisma.scan.findFirst({
    orderBy: { startedAt: "desc" },
    select: { startedAt: true, completedAt: true },
  });

  const lastScanTime = lastScan?.completedAt ?? lastScan?.startedAt;

  const statusEmoji = "🟢";

  await ctx.reply(
    `${statusEmoji} <b>ZEALY QUEST TRACKER</b>\n\n` +
      `🟢 Bot: Online\n` +
      `📊 Projects: ${projects.length}\n` +
      `📋 Total Quests: ${totalQuests}\n` +
      `🔔 New Quests Today: ${newToday}\n\n` +
      `Last Scan: ${lastScanTime ? formatRelativeTime(lastScanTime) : "Never"}`,
    { parse_mode: "HTML" }
  );
}

async function handleProjects(ctx: Context) {
  const chatId = String(ctx.chat?.id);

  if (!isOwner(chatId)) {
    await ctx.reply("⛔ Unauthorized.");
    return;
  }

  const projects = await projectService.findAll();

  if (projects.length === 0) {
    await ctx.reply("📭 No projects tracked yet.\nUse /addproject <URL> to add one.");
    return;
  }

  let message = "📊 <b>TRACKED PROJECTS</b>\n\n";

  for (const project of projects) {
    const statusEmoji = project.isActive ? "🟢" : "🔴";
    const statusText = project.isActive ? "Monitoring" : "Paused";
    const lastScanText = project.lastScanAt
      ? formatRelativeTime(project.lastScanAt)
      : "Never";

    message += `${statusEmoji} <b>${project.projectName}</b>\n`;
    message += `Status: ${statusText}\n`;
    message += `Quests: ${project.questCount}\n`;
    message += `Last Scan: ${lastScanText}\n\n`;
  }

  await ctx.reply(message, { parse_mode: "HTML" });
}

async function handleAddProject(ctx: Context) {
  const chatId = String(ctx.chat?.id);

  if (!isOwner(chatId)) {
    await ctx.reply("⛔ Unauthorized.");
    return;
  }

  const args = getCommandArgs(ctx);
  const url = args[0];

  if (!url) {
    await ctx.reply("❌ Usage: /addproject <URL>\nExample: /addproject https://zealy.io/cw/minebit/questboard/");
    return;
  }

  try {
    const project = await projectService.create({ url });
    
    const statusMsg = await ctx.reply(`🔍 Running initial scan for ${project.projectName}...`);
    
    try {
      const result = await scanService.scanProject(project.id);
      await ctx.telegram.editMessageText(
        chatId,
        statusMsg.message_id,
        undefined,
        `✅ <b>Project Added & Initial Scan Complete</b>\n\n` +
          `🏗 <b>${project.projectName}</b>\n` +
          `🔗 ${project.url}\n` +
          `⏱ Interval: ${project.scanIntervalMinutes} minutes\n\n` +
          `Quests Found: ${result.questsFound}\n` +
          `New Quests: ${result.newQuestsFound} (baseline established)\n\n` +
          `Auto-scan runs every ${project.scanIntervalMinutes} minutes. Use /scan ${project.projectSlug} to scan manually.`,
        { parse_mode: "HTML" }
      );
    } catch (scanError) {
      const safeError = escapeHtml(scanError instanceof Error ? scanError.message : "Unknown error");
      await ctx.telegram.editMessageText(
        chatId,
        statusMsg.message_id,
        undefined,
        `⚠ <b>Project Added</b> but initial scan failed:\n${safeError}\n\n` +
          `🏗 <b>${project.projectName}</b>\n` +
          `🔗 ${project.url}\n` +
          `⏱ Interval: ${project.scanIntervalMinutes} minutes\n\n` +
          `Will retry on next scheduled scan. Use /scan ${project.projectSlug} to retry manually.`,
        { parse_mode: "HTML" }
      );
    }
  } catch (error) {
    const message = escapeHtml(error instanceof Error ? error.message : "Failed to add project");
    await ctx.reply(`❌ ${message}`);
  }
}

async function handleScan(ctx: Context) {
  const chatId = String(ctx.chat?.id);

  if (!isOwner(chatId)) {
    await ctx.reply("⛔ Unauthorized.");
    return;
  }

  const args = getCommandArgs(ctx);
  const slug = args[0];

  if (slug) {
    const project = await projectService.findBySlug(slug);
    if (!project) {
      await ctx.reply(`❌ Project "${slug}" not found.`);
      return;
    }

    if (scanService.isScanning(project.id)) {
      await ctx.reply("⏳ Scan already in progress for this project.");
      return;
    }

    const statusMsg = await ctx.reply(`🔍 Scanning ${project.projectName}...`);

    try {
      const result = await scanService.scanProject(project.id);
      await ctx.telegram.editMessageText(
        chatId,
        statusMsg.message_id,
        undefined,
        `✅ <b>Scan Complete</b>\n\n` +
          `🏗 ${project.projectName}\n` +
          `Quests Found: ${result.questsFound}\n` +
          `New Quests: ${result.newQuestsFound}\n` +
          `${result.newQuestsFound > 0 ? "Notification sent." : "No new quests."}`,
        { parse_mode: "HTML" }
      );
    } catch (error) {
      const safeError = escapeHtml(error instanceof Error ? error.message : "Unknown error");
      await ctx.telegram.editMessageText(
        chatId,
        statusMsg.message_id,
        undefined,
        `❌ Scan failed: ${safeError}`,
        { parse_mode: "HTML" }
      );
    }
  } else {
    const projects = await projectService.findAll();
    const activeProjects = projects.filter((p) => p.isActive);

    if (activeProjects.length === 0) {
      await ctx.reply("📭 No active projects to scan.");
      return;
    }

    const statusMsg = await ctx.reply(`🔍 Scanning ${activeProjects.length} project(s)...`);

    let totalQuests = 0;
    let totalNew = 0;
    const results: string[] = [];

    for (const project of activeProjects) {
      if (scanService.isScanning(project.id)) {
        results.push(`⏭ ${project.projectName} - already scanning`);
        continue;
      }

      try {
        const result = await scanService.scanProject(project.id);
        totalQuests += result.questsFound;
        totalNew += result.newQuestsFound;
        results.push(`✅ ${project.projectName}: ${result.questsFound} quests, ${result.newQuestsFound} new`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        results.push(`❌ ${project.projectName}: ${msg}`);
        logger.error({ error, projectId: project.id }, "Scan failed");
      }
    }

    await ctx.telegram.editMessageText(
      chatId,
      statusMsg.message_id,
      undefined,
      `✅ <b>Scan Complete</b>\n\n` +
        `Projects Scanned: ${activeProjects.length}\n` +
        `Total Quests Found: ${totalQuests}\n` +
        `Total New Quests: ${totalNew}\n` +
        `${totalNew > 0 ? "Notifications sent." : "No new quests."}\n\n` +
        `<b>Details:</b>\n` + results.join("\n"),
      { parse_mode: "HTML" }
    );
  }
}

async function handleScanAll(ctx: Context) {
  const chatId = String(ctx.chat?.id);

  if (!isOwner(chatId)) {
    await ctx.reply("⛔ Unauthorized.");
    return;
  }

  const projects = await projectService.findAll();
  const activeProjects = projects.filter((p) => p.isActive);

  if (activeProjects.length === 0) {
    await ctx.reply("📭 No active projects to scan.");
    return;
  }

  const statusMsg = await ctx.reply(`🔄 Force scanning ALL ${activeProjects.length} projects (bypassing interval)...`);

  let totalQuests = 0;
  let totalNew = 0;
  const results: string[] = [];

  for (const project of activeProjects) {
    try {
      const result = await scanService.scanProject(project.id);
      totalQuests += result.questsFound;
      totalNew += result.newQuestsFound;
      results.push(`✅ ${project.projectName}: ${result.questsFound} quests, ${result.newQuestsFound} new`);
    } catch (error) {
      const msg = escapeHtml(error instanceof Error ? error.message : "Unknown error");
      results.push(`❌ ${project.projectName}: ${msg}`);
      logger.error({ error, projectId: project.id }, "Force scan failed");
    }
  }

  await ctx.telegram.editMessageText(
    chatId,
    statusMsg.message_id,
    undefined,
      `🔄 <b>Force Scan Complete</b>\n\n` +
        `Projects Scanned: ${activeProjects.length}\n` +
        `Total Quests Found: ${totalQuests}\n` +
        `Total New Quests: ${totalNew}\n\n` +
        `<b>Details:</b>\n` + results.join("\n"),
    { parse_mode: "HTML" }
  );
}

async function handlePause(ctx: Context) {
  const chatId = String(ctx.chat?.id);

  if (!isOwner(chatId)) {
    await ctx.reply("⛔ Unauthorized.");
    return;
  }

  const args = getCommandArgs(ctx);
  const slug = args[0];

  if (!slug) {
    await ctx.reply("❌ Usage: /pause <slug>");
    return;
  }

  const project = await projectService.findBySlug(slug);
  if (!project) {
    await ctx.reply(`❌ Project "${slug}" not found.`);
    return;
  }

  await projectService.toggleActive(project.id, false);
  await ctx.reply(`⏸ <b>${project.projectName}</b> paused.`, { parse_mode: "HTML" });
}

async function handleResume(ctx: Context) {
  const chatId = String(ctx.chat?.id);

  if (!isOwner(chatId)) {
    await ctx.reply("⛔ Unauthorized.");
    return;
  }

  const args = getCommandArgs(ctx);
  const slug = args[0];

  if (!slug) {
    await ctx.reply("❌ Usage: /resume <slug>");
    return;
  }

  const project = await projectService.findBySlug(slug);
  if (!project) {
    await ctx.reply(`❌ Project "${slug}" not found.`);
    return;
  }

  await projectService.toggleActive(project.id, true);
  await ctx.reply(`▶️ <b>${project.projectName}</b> resumed.`, { parse_mode: "HTML" });
}

async function handleRemove(ctx: Context) {
  const chatId = String(ctx.chat?.id);

  if (!isOwner(chatId)) {
    await ctx.reply("⛔ Unauthorized.");
    return;
  }

  const args = getCommandArgs(ctx);
  const slug = args[0];

  if (!slug) {
    await ctx.reply("❌ Usage: /remove <slug>");
    return;
  }

  const project = await projectService.findBySlug(slug);
  if (!project) {
    await ctx.reply(`❌ Project "${slug}" not found.`);
    return;
  }

  await ctx.reply(
    `⚠ <b>Are you sure?</b>\n\nThis will delete <b>${project.projectName}</b> and all its quest data.`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🗑 Delete", `confirm_delete:${project.id}`)],
        [Markup.button.callback("❌ Cancel", "cancel_delete")],
      ]),
    }
  );
}

async function handleConfirmDelete(ctx: Context) {
  const chatId = String(ctx.chat?.id);

  if (!isOwner(chatId)) {
    await ctx.answerCbQuery("⛔ Unauthorized.");
    return;
  }

  const data = getCallbackData(ctx);
  const projectId = data?.split(":")[1];

  if (!projectId) {
    await ctx.answerCbQuery("❌ Invalid data");
    return;
  }

  try {
    await projectService.delete(projectId);
    await ctx.editMessageText("✅ Project deleted.", { parse_mode: "HTML" });
  } catch (error) {
    await ctx.editMessageText("❌ Failed to delete project.", { parse_mode: "HTML" });
  }
}

async function handleCancelDelete(ctx: Context) {
  const chatId = String(ctx.chat?.id);

  if (!isOwner(chatId)) {
    await ctx.answerCbQuery("⛔ Unauthorized.");
    return;
  }

  await ctx.editMessageText("❌ Deletion cancelled.", { parse_mode: "HTML" });
}

async function handleScheduler(ctx: Context) {
  const chatId = String(ctx.chat?.id);

  if (!isOwner(chatId)) {
    await ctx.reply("⛔ Unauthorized.");
    return;
  }

  const projects = await projectService.findAll();
  const now = new Date();
  const intervalMs = env.DEFAULT_SCAN_INTERVAL * 60 * 1000;

  let message = `⏰ <b>Scheduler Status</b>\n\n`;
  message += `🟢 Running: Yes\n`;
  message += `⏱ Check Interval: ${env.DEFAULT_SCAN_INTERVAL} minutes\n\n`;
  message += `<b>Next Scheduled Scans:</b>\n`;

  for (const project of projects) {
    if (!project.isActive) {
      message += `\n🔴 ${project.projectName} - Paused`;
      continue;
    }
    const lastChecked = project.lastCheckedAt ? new Date(project.lastCheckedAt) : null;
    if (!lastChecked) {
      message += `\n🟡 ${project.projectName} - Never scanned (due now)`;
      continue;
    }
    const timeSinceLastCheck = now.getTime() - lastChecked.getTime();
    const timeUntilNext = intervalMs - timeSinceLastCheck;
    const status = timeUntilNext <= 0 ? "🔴 Overdue" : "🟢 OK";
    const minutesUntil = Math.ceil(timeUntilNext / 60000);
    message += `\n${status} ${project.projectName} - Last: ${formatRelativeTime(lastChecked)}`;
    if (timeUntilNext > 0) {
      message += ` (~${minutesUntil}min until next)`;
    }
  }

  await ctx.reply(message, { parse_mode: "HTML" });
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}