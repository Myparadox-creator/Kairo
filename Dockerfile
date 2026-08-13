# Development Dockerfile for Kairo extension
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy project files
COPY . .

# Default command for development mode (watches and rebuilds on file change)
CMD ["npm", "run", "dev"]
