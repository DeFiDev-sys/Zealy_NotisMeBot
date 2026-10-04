import { prisma } from "../database/prisma";
import { NormalizedQuest } from "../types";
import { createLogger } from "../utils/logger";

const logger = createLogger("quest-service");

export interface QuestService {
  findByQuestId(questId: string): Promise<{ id: string; notificationSent: boolean } | null>;
  findByProjectId(projectId: string): Promise<NormalizedQuest[]>;
  createMany(quests: NormalizedQuest[], projectId: string): Promise<NormalizedQuest[]>;
  updateLastSeen(questId: string): Promise<void>;
  markNotificationSent(questId: string): Promise<void>;
  countByProjectId(projectId: string): Promise<number>;
}

export const questService: QuestService = {
  async findByQuestId(questId: string) {
    const quest = await prisma.quest.findUnique({
      where: { questId },
      select: { id: true, notificationSent: true },
    });
    return quest;
  },

  async findByProjectId(projectId: string) {
    const quests = await prisma.quest.findMany({
      where: { projectId },
      orderBy: { firstDetectedAt: "desc" },
    });

    return quests.map((q) => ({
      questId: q.questId,
      projectSlug: "",
      projectName: "",
      questName: q.questName,
      questUrl: q.questUrl,
      reward: q.reward,
      detectedAt: q.firstDetectedAt,
    }));
  },

  async createMany(quests: NormalizedQuest[], projectId: string) {
    const created: NormalizedQuest[] = [];

    for (const quest of quests) {
      try {
        const createdQuest = await prisma.quest.create({
          data: {
            questId: quest.questId,
            projectId,
            questName: quest.questName,
            questUrl: quest.questUrl,
            reward: quest.reward,
            firstDetectedAt: quest.detectedAt,
            lastSeenAt: quest.detectedAt,
            notificationSent: false,
          },
        });

        created.push({
          questId: createdQuest.questId,
          projectSlug: quest.projectSlug,
          projectName: quest.projectName,
          questName: createdQuest.questName,
          questUrl: createdQuest.questUrl,
          reward: createdQuest.reward,
          detectedAt: createdQuest.firstDetectedAt,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Unique constraint")) {
          logger.debug({ questId: quest.questId }, "Quest already exists, skipping");
          continue;
        }
        logger.error({ error, questId: quest.questId }, "Failed to create quest");
        throw error;
      }
    }

    logger.info({ created: created.length, projectId }, "Quests created");
    return created;
  },

  async updateLastSeen(questId: string) {
    await prisma.quest.update({
      where: { questId },
      data: { lastSeenAt: new Date() },
    });
  },

  async markNotificationSent(questId: string) {
    await prisma.quest.update({
      where: { questId },
      data: { notificationSent: true },
    });
  },

  async countByProjectId(projectId: string) {
    return prisma.quest.count({ where: { projectId } });
  },
};