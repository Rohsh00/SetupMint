# Production Dockerfile for SetupMint Fastify Backend API
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace package manifests
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/financial-engine/package*.json ./packages/financial-engine/
COPY apps/api/package*.json ./apps/api/

# Install all workspace dependencies
RUN npm ci

# Copy source code
COPY packages/shared/ ./packages/shared/
COPY packages/financial-engine/ ./packages/financial-engine/
COPY apps/api/ ./apps/api/

# Compile TypeScript
RUN npm run build:api

# Runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/financial-engine/package*.json ./packages/financial-engine/
COPY apps/api/package*.json ./apps/api/

RUN npm ci --omit=dev

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/financial-engine/dist ./packages/financial-engine/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

EXPOSE 4000

CMD ["node", "apps/api/dist/server.js"]

