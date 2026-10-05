import { prisma } from "../database/prisma";
import { NormalizedQuest, NotificationStatus } from "../types";
import { createLogger } from "../utils/logger";
import { env } from "../config/env";
import { Telegraf } from "telegraf";

const logger = createLogger("notification-service");

const MAX_NOTIFICATION_LOGS_PER_PROJECT = 50;

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
    lines.push(`📌 ${quest.questName}`);
    if (quest.reward) {
      lines.push(`💎 Reward: ${quest.reward}`);
    }
    lines.push(`🔗 <a href="${quest.questUrl}">Open Quest</a>`);
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }

  lines.push("", `🎯 <b>${quests.length} New Task${quests.length > 1 ? "s" : ""} Available</b>`);

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
      await bot.telegram.sendMessage(chatId, message, {
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