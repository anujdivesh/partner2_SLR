# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

FROM base AS build
ENV NODE_ENV=production
ENV BASE_PATH=/partner2slr
ENV NEXT_PUBLIC_BASE_PATH=/partner2slr
COPY package.json package-lock.json* ./
RUN npm install --include=dev
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV BASE_PATH=/partner2slr
ENV NEXT_PUBLIC_BASE_PATH=/partner2slr
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000", "-H", "0.0.0.0"]
