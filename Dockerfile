# ==========================================
# TikTok Comment Scraper - Railway Dockerfile
# ==========================================

# Stage 1: Install dependencies
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# ==========================================
# Stage 2: Production image with Playwright
# ==========================================
FROM oven/bun:1-debian AS runner

# Install Playwright system dependencies for Chromium
# Using Debian-based image for better Playwright compatibility
RUN apt-get update && apt-get install -y \
    # Chromium dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    # Fonts
    fonts-liberation \
    fonts-noto-color-emoji \
    # Additional utilities
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Install Playwright browsers (Chromium only for smaller image)
RUN bunx playwright install chromium

# Create data directory for output
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Run the web server
CMD ["bun", "run", "web"]
