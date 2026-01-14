FROM node:20-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install --include=optional \
  && npm install --no-save \
    lightningcss-linux-x64-gnu@1.30.2 \
    @tailwindcss/oxide-linux-x64-gnu@4.1.18

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules /app/apps/web/node_modules

ARG NEXT_PUBLIC_A2A_BASE_URL
ARG NEXT_PUBLIC_MCP_BASE_URL
ENV NEXT_PUBLIC_A2A_BASE_URL=${NEXT_PUBLIC_A2A_BASE_URL}
ENV NEXT_PUBLIC_MCP_BASE_URL=${NEXT_PUBLIC_MCP_BASE_URL}

RUN npm run --workspace apps/web build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/packages/shared ./packages/shared

EXPOSE 8080
CMD ["npm", "run", "--workspace", "apps/web", "start", "--", "-p", "8080", "-H", "0.0.0.0"]
