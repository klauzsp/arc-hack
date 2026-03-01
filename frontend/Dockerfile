# Build stage – expects build context = repo root (Railway: Dockerfile path = frontend/Dockerfile, root = .)
FROM node:22-alpine AS builder

WORKDIR /app

# Copy only frontend package files so we use frontend's "next build" script, not root's pnpm script
COPY frontend/package.json frontend/package-lock.json* frontend/yarn.lock* ./
RUN npm ci 2>/dev/null || npm install

# Build-time env (NEXT_PUBLIC_* are inlined at build)
ARG NEXT_PUBLIC_API_URL=https://backend-production-e877.up.railway.app
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
ARG NEXT_PUBLIC_ARC_CORE_ADDRESS=0xa8ce1f3b7c71a9c577686c93c4e8b4924bb5c5ca
ARG NEXT_PUBLIC_ARC_PAYRUN_ADDRESS=0xa5a046e6dc6a10bfd54d88be7744680392feed79
ARG NEXT_PUBLIC_ARC_REBALANCE_ADDRESS=0x3504c84a71902d1af3a74ec50826db8b3a9f67d6
ARG NEXT_PUBLIC_ARC_VESTING_ADDRESS=0x8688a03e4ec16b26dbaffa67a76fd2c3cebe7c68
ARG NEXT_PUBLIC_ARC_USYC_ADDRESS=0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C
ARG NEXT_PUBLIC_ARC_USYC_TELLER_ADDRESS=0x9fdF14c5B14173D74C08Af27AebFf39240dC105A
ARG NEXT_PUBLIC_ARC_CEO_ADDRESS=0x13e00D9810d3C8Dc19A8C9A172fd9A8aC56e94e0
ARG NEXT_PUBLIC_CIRCLE_APP_ID=
ARG NEXT_PUBLIC_CIRCLE_GOOGLE_CLIENT_ID=

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_ARC_RPC_URL=$NEXT_PUBLIC_ARC_RPC_URL
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ENV NEXT_PUBLIC_ARC_CORE_ADDRESS=$NEXT_PUBLIC_ARC_CORE_ADDRESS
ENV NEXT_PUBLIC_ARC_PAYRUN_ADDRESS=$NEXT_PUBLIC_ARC_PAYRUN_ADDRESS
ENV NEXT_PUBLIC_ARC_REBALANCE_ADDRESS=$NEXT_PUBLIC_ARC_REBALANCE_ADDRESS
ENV NEXT_PUBLIC_ARC_VESTING_ADDRESS=$NEXT_PUBLIC_ARC_VESTING_ADDRESS
ENV NEXT_PUBLIC_ARC_USYC_ADDRESS=$NEXT_PUBLIC_ARC_USYC_ADDRESS
ENV NEXT_PUBLIC_ARC_USYC_TELLER_ADDRESS=$NEXT_PUBLIC_ARC_USYC_TELLER_ADDRESS
ENV NEXT_PUBLIC_ARC_CEO_ADDRESS=$NEXT_PUBLIC_ARC_CEO_ADDRESS
ENV NEXT_PUBLIC_CIRCLE_APP_ID=$NEXT_PUBLIC_CIRCLE_APP_ID
ENV NEXT_PUBLIC_CIRCLE_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_CIRCLE_GOOGLE_CLIENT_ID

# Copy rest of frontend (see root .dockerignore so we skip node_modules, .next)
COPY frontend/ .
RUN mkdir -p public
RUN npm run build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Standalone layout: .next/standalone/frontend/server.js (package name = frontend)
COPY --from=builder /app/public ./frontend/public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./frontend/.next/static

# Railway often runs "pnpm start" when it detects a pnpm repo; install pnpm and a start script that runs the server
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
RUN echo '{"name":"frontend","private":true,"scripts":{"start":"node server.js"}}' > ./frontend/package.json

USER nextjs

WORKDIR /app/frontend
EXPOSE 3000

CMD ["node", "server.js"]
