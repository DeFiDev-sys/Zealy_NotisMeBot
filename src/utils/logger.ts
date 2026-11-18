import pino from "pino";
import { env } from "../config/env";

const transport = {
  target: "pino-pretty",
  options: {
    colorize: true,
    translateTime: "HH:MM:ss Z",
    ignore: "pid,hostname",
  },
};

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.LOG_LEVEL !== "silent" ? transport : undefined,
});

export function createLogger(context: string) {
  return logger.child({ context });
}