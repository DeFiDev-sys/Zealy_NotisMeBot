import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  OWNER_TELEGRAM_CHAT_ID: z.string().optional(),
  DATABASE_URL: z.string().default("file:./dev.db"),
  SCRAPER_HEADLESS: z.string().default("true"),
  SCRAPER_TIMEOUT: z.string().default("60000"),
  SCRAPER_RETRIES: z.string().default("3"),
  DEFAULT_SCAN_INTERVAL: z.string().default("2"),
  MIN_EXPECTED_QUEST_RATIO: z.string().default("0.25"),
  LOG_LEVEL: z.string().default("info"),
  MAX_CONCURRENT_SCANS: z.string().default("2"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  TELEGRAM_BOT_TOKEN: parsed.data.TELEGRAM_BOT_TOKEN,
  OWNER_TELEGRAM_CHAT_ID: parsed.data.OWNER_TELEGRAM_CHAT_ID,
  DATABASE_URL: parsed.data.DATABASE_URL,
  SCRAPER_HEADLESS: parsed.data.SCRAPER_HEADLESS === "true",
  SCRAPER_TIMEOUT: parseInt(parsed.data.SCRAPER_TIMEOUT, 10),
  SCRAPER_RETRIES: parseInt(parsed.data.SCRAPER_RETRIES, 10),
  DEFAULT_SCAN_INTERVAL: parseInt(parsed.data.DEFAULT_SCAN_INTERVAL, 10),
  MIN_EXPECTED_QUEST_RATIO: parseFloat(parsed.data.MIN_EXPECTED_QUEST_RATIO),
  LOG_LEVEL: parsed.data.LOG_LEVEL,
  MAX_CONCURRENT_SCANS: parseInt(parsed.data.MAX_CONCURRENT_SCANS, 10),
};

export function isOwner(chatId: string): boolean {
  if (!env.OWNER_TELEGRAM_CHAT_ID) return true;
  return chatId === env.OWNER_TELEGRAM_CHAT_ID;
}