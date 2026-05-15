FROM node:20-slim

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install ALL dependencies (including dev) for build
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build NestJS
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

EXPOSE 3003

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/main"]