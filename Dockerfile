FROM node:20-bookworm-slim

# Install Playwright system dependencies + Chromium + su-exec for user switching
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libatspi2.0-0 libxshmfence1 \
    ca-certificates \
    su-exec \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

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

# Environment defaults (can be overridden by Railway environment variables)
ENV DATABASE_URL="file:/app/data/dev.db"
ENV NODE_ENV=production
ENV SCRAPER_HEADLESS=true

# Entrypoint handles permissions and user switching
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]