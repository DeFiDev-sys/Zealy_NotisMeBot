# Zealy Quest Tracker Bot - Setup & Usage Guide

## Overview

This is a **personal Telegram bot** that monitors Zealy questboards and notifies you when new quests appear. It runs on your machine/server and uses Playwright to scrape Zealy pages.

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Your Server   │     │   Zealy Website  │     │  Your Telegram  │
│                 │     │                  │     │                 │
│  ┌───────────┐  │     │  Questboard Page │     │  Bot Messages   │
│  │ Scheduler │──┼────▶│  (HTML scraping) │     │  (Notifications)│
│  │ (5 min)   │  │     │                  │     │                 │
│  └───────────┘  │     └──────────────────┘     └─────────────────┘
│        │        │
│  ┌───────────┐  │
│  │ Database  │  │
│  │ (SQLite)  │  │
│  └───────────┘  │
└─────────────────┘
```

1. **Scheduler** runs every 5 minutes (configurable)
2. **Scraper** visits each project's questboard URL
3. **Extractor** finds quest anchors (`<a id="..." href=".../questboard/...">`)
4. **Duplicate Check** compares `questId` against database
5. **New Quests** → saved to DB + grouped Telegram notification sent
6. **Existing Quests** → only `lastSeenAt` updated, no notification

---

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Telegram account
- Zealy project(s) to monitor

---

## Step 1: Create Telegram Bot

1. Open Telegram → search `@BotFather`
2. Send `/newbot`
3. Choose name: `My Zealy Tracker`
4. Choose username: `myzealytracker_bot`
5. **Copy the token** (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

---

## Step 2: Get Your Chat ID

1. Start a chat with your new bot
2. Send any message (e.g., "hello")
3. Open in browser: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
4. Find `"chat":{"id":123456789,...}` → **copy that number**

---

## Step 3: Configure Environment

```bash
cd zealy-quest-tracker
cp .env.example .env
```

Edit `.env` with your values:

```env
# REQUIRED - Your bot token from BotFather
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# REQUIRED - Your chat ID (restricts admin commands to you only)
OWNER_TELEGRAM_CHAT_ID=123456789

# Optional - Database location (default: ./dev.db)
DATABASE_URL=file:./dev.db

# Optional - Scraper settings
SCRAPER_HEADLESS=true
SCRAPER_TIMEOUT=30000
SCRAPER_RETRIES=3

# Optional - Scan every 5 minutes (default)
DEFAULT_SCAN_INTERVAL=5

# Optional - Alert if quest count drops below 25% of previous
MIN_EXPECTED_QUEST_RATIO=0.25

# Optional - Log level: debug, info, warn, error
LOG_LEVEL=info
```

**Important**: `OWNER_TELEGRAM_CHAT_ID` makes this a private bot. Only that chat can use `/addproject`, `/scan`, `/pause`, `/resume`, `/remove`. Without it, anyone who finds your bot could control it.

---

## Step 4: Install & Run

```bash
# Install dependencies
pnpm install

# Install Chromium for Playwright
pnpm exec playwright install chromium

# Generate Prisma client & create database
pnpm db:generate
pnpm db:push

# Development (auto-reload on changes)
pnpm dev

# OR Production
pnpm build
pnpm start
```

You should see:
```
[INFO] Starting Zealy Quest Tracker...
[INFO] Database connected
[INFO] Bot started successfully
[INFO] Starting scheduler with 5 minute interval
```

---

## Step 5: Add Your First Project

1. Go to a Zealy questboard, e.g.: `https://zealy.io/cw/minebit/questboard/`
2. Copy the URL
3. In Telegram, send to your bot:
```
/addproject https://zealy.io/cw/minebit/questboard/
```

Bot responds:
```
✅ Project Added

🏗 Minebit
🔗 https://zealy.io/cw/minebit/questboard/
⏱ Interval: 5 minutes

Initial scan completed. Use /scan minebit to scan manually.
```

---

## All Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Register your chat, show welcome | `/start` |
| `/help` | List all commands | `/help` |
| `/status` | Bot stats (projects, quests, last scan) | `/status` |
| `/projects` | List tracked projects with quest counts | `/projects` |
| `/addproject <URL>` | Add new Zealy questboard | `/addproject https://zealy.io/cw/minebit/questboard/` |
| `/scan` | Scan all active projects now | `/scan` |
| `/scan <slug>` | Scan specific project | `/scan minebit` |
| `/pause <slug>` | Stop auto-scanning a project | `/pause minebit` |
| `/resume <slug>` | Resume auto-scanning | `/resume minebit` |
| `/remove <slug>` | Delete project (with confirmation) | `/remove minebit` |

---

## Notification Format

When new quests are found, you receive:

```
🚨 NEW ZEALY QUESTS DETECTED

🏗 Project: Minebit
━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 Follow Minebit on X
💎 Reward: 500 XP
🔗 Open Quest: https://zealy.io/...
━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 Join Minebit Discord
💎 Reward: 1000 XP
🔗 Open Quest: https://zealy.io/...
━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 2 New Tasks Available
```

Each quest has an **🚀 Open Quest** button that opens the quest page directly.

---

## Project Status Indicators

```
/projects output:

📊 TRACKED PROJECTS

🟢 Minebit
Status: Monitoring
Quests: 15
Last Scan: 2 minutes ago

🔴 AnotherProject
Status: Paused
Quests: 8
Last Scan: 1 hour ago
```

- 🟢 = Active (auto-scanning)
- 🔴 = Paused (manual scan only)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Bot not responding" | Check `TELEGRAM_BOT_TOKEN` is correct, bot is running |
| "⛔ Unauthorized" | You're not the `OWNER_TELEGRAM_CHAT_ID` |
| "Invalid Zealy URL" | Must be `https://zealy.io/cw/{slug}/questboard/` |
| "Scan failed" | Check logs - usually network timeout or Zealy blocked bot |
| "No quests found" | Zealy may have changed HTML; check selectors |
| Chromium not found | Run `pnpm exec playwright install chromium` |

---

## Customization

### Change Scan Interval
Per-project: not yet implemented (uses `DEFAULT_SCAN_INTERVAL`)
Global: edit `DEFAULT_SCAN_INTERVAL` in `.env` (minutes)

### Enable Initial Scan Notifications
By default, first scan saves quests silently. To notify on initial scan:
```env
# Not yet implemented per-project, but you can modify project-service.ts
notifyOnInitialScan=true
```

### Adjust Suspicious Scan Threshold
If Zealy often returns fewer quests temporarily:
```env
MIN_EXPECTED_QUEST_RATIO=0.1  # Allow 90% drop before flagging
```

---

## Running in Production (Linux)

```bash
# Use PM2 for process management
pnpm install -g pm2
pnpm build
pm2 start dist/index.js --name zealy-tracker
pm2 save
pm2 startup
```

Or systemd service:
```ini
# /etc/systemd/system/zealy-tracker.service
[Unit]
Description=Zealy Quest Tracker
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/zealy-quest-tracker
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

---

## Database Management

```bash
# Open Prisma Studio (web UI)
pnpm db:studio

# Reset database (careful - deletes all data)
pnpm exec prisma migrate reset

# View schema
cat prisma/schema.prisma
```

---

## File Structure Reference

```
zealy-quest-tracker/
├── .env                    # YOUR CONFIG (don't commit)
├── .env.example            # Template
├── prisma/
│   └── schema.prisma       # Database schema
├── src/
│   ├── index.ts            # Entry point
│   ├── bot/
│   │   ├── bot.ts          # Telegraf setup
│   │   └── commands.ts     # All command handlers
│   ├── scraper/
│   │   ├── zealy-scraper.ts    # Playwright scraping
│   │   ├── quest-extractor.ts  # Parse quest data
│   │   └── selectors.ts        # CSS selectors
│   ├── services/
│   │   ├── project-service.ts
│   │   ├── quest-service.ts
│   │   ├── scan-service.ts
│   │   ├── scheduler-service.ts
│   │   └── notification-service.ts
│   ├── config/env.ts       # Zod validation
│   ├── utils/logger.ts     # Pino logging
│   └── types/index.ts      # TypeScript types
└── tests/                  # Vitest tests
```

---

## Security Notes

- **Never commit `.env`** - contains bot token
- **Set `OWNER_TELEGRAM_CHAT_ID`** - prevents unauthorized access
- **Bot token = full control** - treat like a password
- **Runs locally** - no external servers see your data

---

## Support

Check logs for errors:
```bash
pnpm dev  # Shows structured logs
```

Common log prefixes:
- `[bot]` - Telegram events
- `[zealy-scraper]` - Scraping activity
- `[scan-service]` - Scan orchestration
- `[notification-service]` - Message sending
- `[scheduler-service]` - Scheduled runs