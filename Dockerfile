FROM node:24-bookworm-slim
ARG INSTALL_MPT=0
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg espeak-ng fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN if [ "$INSTALL_MPT" = "1" ]; then apt-get update && apt-get install -y --no-install-recommends python3 python3-venv git && npm run media:setup && rm -rf /var/lib/apt/lists/*; fi
RUN npm run build && mkdir -p /app/data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=4310 DATA_DIR=/app/data WORKER_INLINE=false
EXPOSE 4310
CMD ["npm", "start"]
