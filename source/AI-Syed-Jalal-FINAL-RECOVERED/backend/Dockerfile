# Build from the PROJECT ROOT (context: .) so ../config is available to the backend.
FROM node:22-alpine
WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY backend/ ./
COPY config/ /app/config/
EXPOSE 8787
CMD ["node", "server.mjs"]
