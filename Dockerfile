FROM node:20-bookworm-slim

# Install Playwright system dependencies + Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libatspi2.0-0 libxshmfence1 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable pnpm

# Install dependencies first (better caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

# Generate Prisma client
COPY prisma ./prisma/
RUN pnpm db:generate

# Copy source and build
COPY . .
RUN pnpm build

# Environment defaults (overridden by Railway environment variables)
ENV DATABASE_URL="postgresql://postgres:password@host:5432/postgres?connection_limit=1&sslmode=require"
ENV NODE_ENV=production
ENV SCRAPER_HEADLESS=true
# Ensure Playwright uses a cache directory accessible by node user
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.cache/ms-playwright

# Create cache directory with correct permissions BEFORE switching to node user
RUN mkdir -p /app/.cache/ms-playwright && chown -R node:node /app/.cache

# Run as non-root
USER node

# Install Playwright browsers as node user (after USER switch)
RUN pnpm exec playwright install chromium

CMD ["node", "dist/index.js"]