FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
    && chown -R node:node /app

ENV NODE_ENV=production

USER node

EXPOSE 3000

CMD ["npm", "start"]
