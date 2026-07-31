FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_VERSION=10.30.1

RUN npm install -g pnpm@${PNPM_VERSION}

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1
ENV BLOG_CONTENT_DIRECTORY=/app/content/blog

RUN addgroup -S -g 1001 nodejs \
    && adduser -S -D -H -u 1001 -G nodejs nextjs

COPY --chown=nextjs:nodejs --from=builder /app/public ./public
COPY --chown=nextjs:nodejs --from=builder /app/content ./content
COPY --chown=nextjs:nodejs --from=builder /app/.next/standalone ./
COPY --chown=nextjs:nodejs --from=builder /app/.next/static ./.next/static

RUN mkdir -p /app/content/blog /app/content/.trash/blog \
    && chown -R nextjs:nodejs /app/content \
    && chmod -R u+rwX /app/content

USER nextjs:nodejs

EXPOSE 3000

CMD ["node", "server.js"]
