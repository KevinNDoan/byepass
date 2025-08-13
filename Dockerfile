# Deterministic runtime for Puppeteer + Next.js
FROM node:20-bookworm

ENV NODE_ENV=production
WORKDIR /app

# Install system deps for Chromium
RUN apt-get update && apt-get install -y \
  chromium chromium-common chromium-driver \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  libu2f-udev \
  libvulkan1 \
  && rm -rf /var/lib/apt/lists/*

# Cache directory for Puppeteer's managed browser
ENV PUPPETEER_CACHE_DIR=/usr/local/share/puppeteer

COPY package*.json ./
RUN npm ci --include=dev
# Pre-install a Chromium build managed by Puppeteer so executablePath() works
RUN npx --yes puppeteer browsers install chromium

COPY . .
RUN npm run build

EXPOSE 3000
# Render provides $PORT; bind Next.js to it on all interfaces
ENV HOST=0.0.0.0 \
    PORT=3000
CMD ["sh", "-lc", "npm run start -- -p ${PORT} -H ${HOST}"]

