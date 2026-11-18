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
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Generate Prisma client
COPY prisma ./prisma/
RUN pnpm db:generate

# Copy source and build
COPY . .
RUN pnpm build

# Environment defaults
ENV DATABASE_URL="file:/app/data/dev.db"
ENV NODE_ENV=production
ENV SCRAPER_HEADLESS=true

# Ensure data directory exists (Railway Volume mounts here)
RUN mkdir -p /app/data

# Run as non-root (optional but good practice)
USER node

CMD ["node", "dist/index.js"]