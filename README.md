# Zealy Quest Tracker Bot

A personal Telegram bot that monitors Zealy questboards and sends notifications when new quests are detected.

## Features

- 🤖 Telegram bot with Telegraf
- 🔍 Monitors Zealy questboards for new quests
- 📊 Tracks multiple projects
- 🔔 Sends grouped Telegram notifications with inline buttons
- 🗄️ SQLite database with Prisma ORM
- ⏰ Automatic periodic scans (configurable interval)
- 📝 Manual scan commands
- ⏸️ Pause/resume projects
- 🗑️ Remove projects with confirmation

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript (strict)
- **Package Manager**: pnpm
- **Telegram**: Telegraf
- **Web Scraping**: Playwright (Chromium)
- **Database**: SQLite with Prisma
- **Validation**: Zod
- **Testing**: Vitest
- **Logging**: Pino

## Project Structure

```
zealy-quest-tracker/
├── src/
│   ├── bot/
│   │   ├── bot.ts           # Bot initialization
│   │   └── commands.ts      # Command handlers
│   ├── scraper/
│   │   ├── zealy-scraper.ts     # Playwright scraper
│   │   ├── quest-extractor.ts   # Quest data extraction
│   │   └── selectors.ts         # CSS selectors
│   ├── services/
│   │   ├── project-service.ts   # Project CRUD
│   │   ├── quest-service.ts     # Quest CRUD
│   │   ├── scan-service.ts      # Scan orchestration
│   │   ├── scheduler-service.ts # Automatic scheduling
│   │   └── notification-service.ts # Telegram notifications
│   ├── database/
│   │   └── prisma.ts            # Prisma client
│   ├── config/
│   │   └── env.ts               # Environment validation
│   ├── utils/
│   │   ├── logger.ts            # Pino logger
│   │   └── zealy-url.ts         # URL parsing
│   ├── types/
│   │   └── index.ts             # Type definitions
│   └── index.ts                 # Entry point
├── prisma/
│   └── schema.prisma            # Database schema
├── tests/
│   ├── zealy-url.test.ts
│   └── quest-extractor.test.ts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Installation

1. Clone the repository:
```bash
cd zealy-quest-tracker
```

2. Install dependencies:
```bash
pnpm install
```

3. Install Playwright browsers:
```bash
pnpm exec playwright install chromium
```

4. Copy environment file and configure:
```bash
cp .env.example .env
# Edit .env with your values
```

5. Generate Prisma client and create database:
```bash
pnpm db:generate
pnpm db:push
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from BotFather |
| `OWNER_TELEGRAM_CHAT_ID` | No | Restrict admin commands to this chat ID |
| `DATABASE_URL` | No | SQLite database path (default: `file:./dev.db`) |
| `SCRAPER_HEADLESS` | No | Run browser headless (default: `true`) |
| `SCRAPER_TIMEOUT` | No | Page load timeout in ms (default: `30000`) |
| `SCRAPER_RETRIES` | No | Number of retry attempts (default: `3`) |
| `DEFAULT_SCAN_INTERVAL` | No | Scan interval in minutes (default: `5`) |
| `MIN_EXPECTED_QUEST_RATIO` | No | Suspicious scan threshold (default: `0.25`) |
| `LOG_LEVEL` | No | Log level (default: `info`) |

## Telegram BotFather Setup

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` and follow instructions
3. Copy the bot token to `TELEGRAM_BOT_TOKEN` in `.env`
4. (Optional) Set a username, description, and profile picture

## Getting Your Telegram Chat ID

1. Start a chat with your bot
2. Send any message
3. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Find your `chat.id` in the response
5. Add it to `OWNER_TELEGRAM_CHAT_ID` in `.env`

## Running the Bot

Development mode (with auto-reload):
```bash
pnpm dev
```

Production mode:
```bash
pnpm build
pnpm start
```

## Adding a Zealy Project

1. Go to the Zealy questboard page (e.g., `https://zealy.io/cw/minebit/questboard/`)
2. Copy the URL
3. In Telegram, send:
```
/addproject https://zealy.io/cw/minebit/questboard/
```

The bot will:
- Validate the URL format
- Extract the project slug (`minebit`)
- Create a project with name "Minebit"
- Perform initial scan (no notifications by default)
- Start monitoring every 5 minutes

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Register your chat ID and welcome message |
| `/help` | Show available commands |
| `/status` | Show bot status and statistics |
| `/projects` | List all tracked projects |
| `/addproject <URL>` | Add a new Zealy questboard |
| `/scan` | Scan all active projects |
| `/scan <slug>` | Scan a specific project |
| `/pause <slug>` | Pause monitoring for a project |
| `/resume <slug>` | Resume monitoring for a project |
| `/remove <slug>` | Remove a project (with confirmation) |

## How Duplicate Detection Works

1. Each quest has a unique `questId` (from the anchor's `id` attribute or URL segment)
2. On each scan, quests are compared against the database by `questId`
3. If `questId` exists: update `lastSeenAt`, don't notify
4. If `questId` is new: save to database, add to `newQuests[]` array
4. After scan completes: if `newQuests.length > 0`, send grouped notification
5. Initial scan: saves quests without sending notifications (configurable)

## Known Limitations

- **No CAPTCHA/anti-bot bypass**: If Zealy presents CAPTCHAs, scans will fail
- **Single owner only**: No multi-user support
- **SQLite only**: Not suitable for high-concurrency production use
- **No web dashboard**: CLI/Telegram only
- **Playwright dependency**: Requires Chromium installation
- **Selector fragility**: Relies on Zealy's HTML structure (may break on site updates)
- **No quest categories**: All quests treated equally
- **No retry queue**: Failed notifications not retried automatically

## Database Schema

```prisma
model Project {
  id                   String   @id @default(cuid())
  url                  String   @unique
  projectSlug          String   @unique
  projectName          String
  isActive             Boolean  @default(true)
  scanIntervalMinutes  Int      @default(5)
  notifyOnInitialScan  Boolean  @default(false)
  lastCheckedAt        DateTime?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
}

model Quest {
  id             String   @id @default(cuid())
  questId        String   @unique
  projectId      String
  questName      String
  questUrl       String
  reward         String?
  firstDetectedAt DateTime @default(now())
  lastSeenAt     DateTime @default(now())
  notificationSent Boolean  @default(false)
}

model Scan {
  id              String   @id @default(cuid())
  projectId       String
  startedAt       DateTime @default(now())
  completedAt     DateTime?
  status          String   @default("PENDING")
  questsFound     Int      @default(0)
  newQuestsFound  Int      @default(0)
  errorMessage    String?
}

model NotificationLog {
  id          String   @id @default(cuid())
  projectId   String
  message     String
  status      String   @default("PENDING")
  sentAt      DateTime?
  errorMessage String?
}
```

## Development

Run tests:
```bash
pnpm test
```

Run tests in watch mode:
```bash
pnpm test:watch
```

Open Prisma Studio:
```bash
pnpm db:studio
```

## License

MIT