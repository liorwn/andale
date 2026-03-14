FROM node:22-slim

# Install Chromium for SingleFile capture + Lighthouse
# Also install single-file-cli globally so it's available at runtime
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g single-file-cli

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Install core library dependencies
COPY package*.json ./
RUN npm ci

# Copy core source and build TypeScript
COPY src/ ./src/
COPY tsconfig.json ./
RUN npx tsc

# Verify core dist exists
RUN ls -la /app/dist/capture.js /app/dist/transform.js /app/dist/report.js

# Install web app dependencies
COPY web/package*.json ./web/
RUN cd web && npm ci

# Copy web source and build (clean .next to avoid stale cache)
COPY web/ ./web/
RUN cd web && rm -rf .next && npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

WORKDIR /app/web
CMD ["npx", "next", "start", "-p", "3000"]
