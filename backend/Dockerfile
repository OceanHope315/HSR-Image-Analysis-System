FROM node:22-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace backend --include-workspace-root=false

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app/backend

COPY --from=dependencies /app/node_modules /app/node_modules
COPY --from=dependencies /app/backend/node_modules /app/backend/node_modules
COPY backend/ ./

RUN mkdir -p uploads/xrays logs \
    && chown -R node:node /app/backend

USER node
EXPOSE 5000

CMD ["node", "server.js"]
