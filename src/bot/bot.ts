import { Telegraf, Context } from "telegraf";
import { env, isOwner } from "../config/env.js";
import { registerCommands } from "./commands.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("bot");

function getCommandName(ctx: Context): string | undefined {
  if (!ctx.message || !("text" in ctx.message)) return undefined;
  return ctx.message.text.split(" ")[0]?.slice(1);
}

export function createBot(): Telegraf<Context> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  const bot = new Telegraf<Context>(env.TELEGRAM_BOT_TOKEN);

  bot.use(async (ctx, next) => {
    const start = Date.now();
    try {
      await next();
    } finally {
      const ms = Date.now() - start;
      logger.debug({ method: ctx.updateType, chatId: ctx.chat?.id, ms }, "Request completed");
    }
  });

  bot.use(async (ctx, next) => {
    const chatId = String(ctx.chat?.id);

    const adminCommands = ["addproject", "scan", "pause", "resume", "remove", "projects"];
    const command = getCommandName(ctx);

    if (command && adminCommands.includes(command) && !isOwner(chatId)) {
      await ctx.reply("⛔ Unauthorized.");
      return;
    }

    await next();
  });

  registerCommands(bot);

  bot.catch((err, ctx) => {
    logger.error({ error: err, update: ctx.update }, "Bot error");
  });

  return bot;
}

export async function startBot(bot: Telegraf<Context>) {
  try {
    // Don't await bot.launch() - it resolves only when the bot stops.
    // Catch and log errors, but let execution continue so scheduler can start.
    bot.launch().catch((error) => {
      logger.error({ error }, "Bot launch failed");
    });
    logger.info("Bot started successfully");
  } catch (error) {
    logger.error({ error }, "Failed to start bot");
    throw error;
  }
}

export async function stopBot(bot: Telegraf<Context>) {
  bot.stop();
  logger.info("Bot stopped");
}