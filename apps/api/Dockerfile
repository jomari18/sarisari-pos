# SariSari POS API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t sari-api .
# The same image runs in Docker Compose, in CI and on Render (spec 14).

FROM node:24-alpine AS build
WORKDIR /app

# Manifests first, so the dependency layer is reused until they change. The API's postinstall runs
# `prisma generate`, which needs the schema and the Prisma config.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @sari/api \
 && npm prune --omit=dev --no-audit --no-fund

FROM node:24-alpine
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app

# Only production dependencies and compiled output. The workspace link node_modules/@sari/shared
# points at packages/shared, so its manifest and dist keep their places.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json /app/apps/api/prisma.config.ts apps/api/
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/dist apps/api/dist

WORKDIR /app/apps/api
USER node
EXPOSE 8080
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
