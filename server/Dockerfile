FROM node:20-alpine
WORKDIR /app

# Install deps deterministik
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY . .

ENV NODE_ENV=production

# Start server (Railway inject PORT otomatis)
CMD ["node","src/index.js"]
