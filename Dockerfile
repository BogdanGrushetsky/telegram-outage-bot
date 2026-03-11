# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for signal handling and wget for health checks
RUN apk add --no-cache dumb-init wget

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Expose port (default 3000, can be overridden via ENV)
EXPOSE ${API_PORT:-3000}

# Use dumb-init to run the app
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
