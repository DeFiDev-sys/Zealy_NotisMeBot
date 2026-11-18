import { prisma } from "../database/prisma";
import { NormalizedQuest, NotificationStatus } from "../types";
import { createLogger } from "../utils/logger";
import { env } from "../config/env";
import { Telegraf } from "telegraf";

const logger = createLogger("notification-service");

const MAX_NOTIFICATION_LOGS_PER_PROJECT = 50;

/**
 * Escape HTML special characters in user-provided content
 * to prevent Telegram HTML parser errors (e.g. a stray <3).
 * Only the characters that would break a tag are escaped.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface NotificationService {
  sendNewQuestsNotification(
    chatId: string,
    projectName: string,
    projectSlug: string,
    quests: NormalizedQuest[]
  ): Promise<void>;
  sendCycleSummaryNotification(
    chatId: string,
    message: string
  ): Promise<void>;
  logNotification(
    projectId: string,
    message: string,
    status: NotificationStatus,
    errorMessage?: string
  ): Promise<void>;
}

function formatQuestMessage(projectName: string, quests: NormalizedQuest[]): string {
  const lines = [
    "🚨 <b>NEW ZEALY QUESTS DETECTED</b>",
    "",
    `🏗 <b>Project:</b> ${projectName}`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ];

  for (const quest of quests) {
    // Escape stray < or > that could break Telegram's HTML parser
    const safeQuestName = quest.questName.replace(/[<>]/g, c => `&#${c.charCodeAt(0)};`);
    lines.push(`📌 ${safeQuestName}`);
    if (quest.reward) {
      const safeReward = quest.reward.replace(/[<>]/g, c => `&#${c.charCodeAt(0)};`);
      lines.push(`💎 Reward: ${safeReward}`);
    }
    // Escape any stray < > in the URL anchor text (the URL itself is already safe)
    const safeUrlText = "Open Quest"; // static text, no escaping needed
    lines.push(`🔗 <a href="${quest.questUrl}">Open Quest</a>`);
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }

  // Escape the final line to prevent stray <3 etc.
  const finalLine = `🎯 <b>${quests.length} New Task${quests.length > 1 ? "s" : ""} Available</b>`.replace(/[<>]/g, c => `&#${c.charCodeAt(0)};`);
  lines.push("", finalLine);

  return lines.join("\n");
}

function createInlineKeyboard(quests: NormalizedQuest[]) {
  const buttons = quests.map((quest) => [
    { text: "🚀 Open Quest", url: quest.questUrl },
  ]);

  return {
    inline_keyboard: buttons,
  };
}

const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

export const notificationService: NotificationService = {
  async sendNewQuestsNotification(
    chatId: string,
    projectName: string,
    projectSlug: string,
    quests: NormalizedQuest[]
  ) {
    try {
      const message = formatQuestMessage(projectName, quests);
      const keyboard = createInlineKeyboard(quests);

      await bot.telegram.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      });

      logger.info({ chatId, projectName, questCount: quests.length }, "Notification sent");
    } catch (error) {
      logger.error({ error, chatId, projectName }, "Failed to send notification");
      throw error;
    }
  },

  async sendCycleSummaryNotification(
    chatId: string,
    message: string
  ) {
    try {
      const safeMessage = escapeHtml(message);
    await bot.telegram.sendMessage(chatId, safeMessage, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });

      logger.info({ chatId }, "Cycle summary sent");
    } catch (error) {
      logger.error({ error, chatId }, "Failed to send cycle summary");
      throw error;
    }
  },

  async logNotification(
    projectId: string,
    message: string,
    status: NotificationStatus,
    errorMessage?: string
  ) {
    await prisma.notificationLog.create({
      data: {
        projectId,
        message,
        status,
        sentAt: status === "SENT" ? new Date() : null,
        errorMessage,
      },
    });

    // Prune old notification logs beyond the most recent 50 per project
    try {
      const keepIds = await prisma.notificationLog.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: MAX_NOTIFICATION_LOGS_PER_PROJECT,
        select: { id: true },
      });

      if (keepIds.length >= MAX_NOTIFICATION_LOGS_PER_PROJECT) {
        const idsToKeep = keepIds.map((r) => r.id);
        await prisma.notificationLog.deleteMany({
          where: {
            projectId,
            id: { notIn: idsToKeep },
          },
        });
      }
    } catch (pruneError) {
      logger.warn({ error: pruneError, projectId }, "Failed to prune notification logs");
    }
  },
};