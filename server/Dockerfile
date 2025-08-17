# Server Dockerfile (relaxed install so lock mismatch tidak bikin gagal)
FROM node:20-alpine AS base

WORKDIR /app
ENV NODE_ENV=production

# Copy manifest dulu biar layer cache efisien
COPY package*.json ./

# Pakai npm install (BUKAN npm ci) agar tidak fail kalau lockfile belum sync
RUN npm install --omit=dev

# Baru copy seluruh source
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
