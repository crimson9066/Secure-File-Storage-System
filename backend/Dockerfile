# Multi-stage build for production optimization
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Final stage
FROM node:18-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Create uploads directory
RUN mkdir -p /app/uploads

# Copy application files
COPY . .

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Start server
CMD ["npm", "start"]

# Build: docker build -t securevault-backend .
# Run:   docker run -p 5000:5000 --env-file .env securevault-backend
# Or use docker-compose.yml for full stack
