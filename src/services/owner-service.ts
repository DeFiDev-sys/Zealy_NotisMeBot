import { prisma } from "../database/prisma";
import { createLogger } from "../utils/logger";

const logger = createLogger("owner-service");

export interface OwnerService {
  upsert(chatId: string, username?: string, firstName?: string): Promise<void>;
  find(): Promise<{ chatId: string; username?: string; firstName?: string } | null>;
  isOwner(chatId: string): boolean;
}

export const ownerService: OwnerService = {
  async upsert(chatId: string, username?: string, firstName?: string) {
    await prisma.telegramOwner.upsert({
      where: { chatId },
      update: { username, firstName, updatedAt: new Date() },
      create: { chatId, username, firstName },
    });
    logger.info({ chatId, username, firstName }, "Owner registered/updated");
  },

  async find() {
    const owner = await prisma.telegramOwner.findFirst();
    return owner ? { chatId: owner.chatId, username: owner.username ?? undefined, firstName: owner.firstName ?? undefined } : null;
  },

  isOwner(chatId: string): boolean {
    return false;
  },
};