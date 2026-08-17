FROM oven/bun:1.3-debian AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

FROM oven/bun:1.3-debian
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
COPY server ./server
COPY public ./public
RUN mkdir -p /app/data/uploads
RUN chown -R 1000:1000 /app
USER 1000
EXPOSE 3001
CMD ["bun", "server/index.ts"]
