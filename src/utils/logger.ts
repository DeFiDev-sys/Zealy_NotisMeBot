import { pino } from "pino";
import { env } from "../config/env.js";

const transport = {
  target: "pino-pretty",
  options: {
    colorize: true,
    translateTime: "HH:MM:ss Z",
    ignore: "pid,hostname",
  },
};

const pinoLogger = pino({
  level: env.LOG_LEVEL,
  transport: env.LOG_LEVEL !== "silent" ? transport : undefined,
});

export const logger = pinoLogger;

export function createLogger(context: string) {
  return logger.child({ context });
}