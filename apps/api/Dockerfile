FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma + pin npm to stable version
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/* \
    && npm install -g npm@10.2.4

# Copy package files and install deps
COPY package.json package-lock.json ./
COPY .npmrc ./
RUN npm ci

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npm run build

# --- Production stage ---
FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/* \
    && npm install -g npm@10.2.4

COPY package.json package-lock.json ./
COPY .npmrc ./
RUN npm ci --omit=dev

# Copy prisma schema + generated client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# Copy built app
COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/src/main"]
