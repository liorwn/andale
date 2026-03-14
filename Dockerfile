FROM node:22-slim

# Install Chromium + single-file-cli
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

# Copy EVERYTHING first (simplest approach, no layer caching tricks)
COPY . .

# Build core TypeScript
RUN npm ci && npx tsc
RUN ls -la /app/dist/capture.js && echo "Core built OK"

# Build web app
RUN cd web && npm ci && rm -rf .next && npm run build
RUN echo "Web built OK - no standalone mode"

ENV NODE_ENV=production

WORKDIR /app/web
CMD ["sh", "-c", "npx next start -p ${PORT:-3000}"]
