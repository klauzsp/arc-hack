FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["pnpm", "run", "start"]