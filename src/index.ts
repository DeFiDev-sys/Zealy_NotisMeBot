import { connectDatabase, disconnectDatabase } from "./database/prisma.js";
import { createBot, startBot, stopBot } from "./bot/bot.js";
import { schedulerService } from "./services/scheduler-service.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("main");

async function main() {
  logger.info("Starting Zealy Quest Tracker...");

  await connectDatabase();

  const bot = createBot();

  await startBot(bot);

  schedulerService.start();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down...");
    schedulerService.stop();
    await stopBot(bot);
    await disconnectDatabase();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error({ error }, "Fatal error");
  process.exit(1);
});