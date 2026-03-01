# Use this when Railway "Root Directory" = backend (build context is the backend folder).
# If your Root Directory is the repo root, use the root Dockerfile that copies the workspace instead.

FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/src/index.js"]
