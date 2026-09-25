# Multi-stage build using Next.js standalone output.
#   docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t mixology .
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Commit shown dimly in the TV corner (Vercel uses VERCEL_GIT_COMMIT_SHA instead).
ARG GIT_SHA=""
ENV GIT_SHA=${GIT_SHA}
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
# DATABASE_URL is supplied at runtime (compose reads it from .env); it is never baked into the image.
CMD ["node", "server.js"]
