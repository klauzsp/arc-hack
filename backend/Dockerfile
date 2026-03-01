# Build context must be the repo root (Railway: Root Directory = '' or '.', Dockerfile = backend/Dockerfile).
# Copies workspace files and backend, then builds only the backend.

FROM node:22-alpine

WORKDIR /app

# Copy workspace manifests first for cache
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy backend manifest so pnpm can resolve workspace
COPY backend/package.json backend/package.json

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN pnpm install --frozen-lockfile --filter backend...

# Copy backend source (requires backend/ in context – do not add "backend" to root .dockerignore)
COPY backend backend

# Build and start backend only
WORKDIR /app/backend
RUN pnpm run build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/src/index.js"]
