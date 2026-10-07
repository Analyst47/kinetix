# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S -g 10001 kinetix && adduser -S -u 10001 -G kinetix kinetix
COPY --from=build --chown=kinetix:kinetix /app/.next/standalone ./
COPY --from=build --chown=kinetix:kinetix /app/.next/static ./.next/static
COPY --from=build --chown=kinetix:kinetix /app/public ./public
USER kinetix
EXPOSE 3000
CMD ["node", "server.js"]
