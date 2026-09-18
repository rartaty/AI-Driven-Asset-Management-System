# ===============================================================
# frontend/Dockerfile — Project Big Tester
# ---------------------------------------------------------------
# Next.js 16 ダッシュボードの本番稼働用 multi-stage image.
#
# 要件: A.1 (Podman + restart: always)
# 関連: WAF-H8 (2026-05-18) / docker-compose.yml
#
# Multi-stage:
#  1. deps  - npm ci (依存解決のみ・キャッシュ層)
#  2. build - next build (production bundle 生成)
#  3. runner - 最小 image (実行時のみ)
#
# 注: Next.js 16 の standalone output を活用するには next.config.ts に
#     `output: 'standalone'` 追加が必要 (M11 で対応予定. 現状は npm start で動作).
# ===============================================================

# === Stage 1: dependencies ===
FROM node:20-alpine AS deps
WORKDIR /app

# Alpine では libc6-compat が必要 (Next.js の swc bin に関わる)
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts


# === Stage 2: builder ===
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

RUN npm run build


# === Stage 3: runner (最小 production image) ===
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Tokyo

# 非 root ユーザー作成
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# 必要な artifacts のみコピー (image サイズ最小化)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

RUN chown -R nextjs:nodejs /app
USER nextjs

# ヘルスチェック (Next.js のデフォルト / で 200 を期待)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:3000/ > /dev/null || exit 1

EXPOSE 3000

CMD ["npm", "start"]
