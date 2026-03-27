# Use Node.js 20 LTS (Node 18 EOL April 2025)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application code
COPY . .

# Create uploads directory (dev fallback only — production uses Cloudinary)
RUN mkdir -p uploads

# Don't run as root
USER node

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

# Start the application
CMD ["npm", "start"]
