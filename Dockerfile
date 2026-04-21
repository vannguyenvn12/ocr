# syntax=docker/dockerfile:1.6
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Asia/Ho_Chi_Minh

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src ./src
COPY credentials.json ./credentials.json

RUN mkdir -p /app/temp && \
    useradd -r -u 1001 -g nogroup ocr && \
    chown -R ocr:nogroup /app
USER ocr

CMD ["npm", "run", "cron"]
