FROM node:24-alpine AS build
WORKDIR /app/apps/merchant-console
COPY apps/merchant-console/package*.json ./
RUN npm ci
COPY apps/merchant-console/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
USER node
EXPOSE 3084
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3084"]
