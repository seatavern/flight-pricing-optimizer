FROM node:22-bookworm-slim AS frontend

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Same-origin API paths. The container proxy routes them to FastAPI.
# Local development leaves this unset and keeps the localhost:8000 fallback.
ARG NEXT_PUBLIC_API_BASE_URL=/
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

WORKDIR /app
COPY backend /app/backend
COPY docker/start.mjs /app/docker/start.mjs
COPY --from=frontend /app/.next/standalone /app/frontend
COPY --from=frontend /app/.next/static /app/frontend/.next/static
COPY --from=frontend /app/public /app/frontend/public

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=600s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(async (r)=>{const t=await r.text();process.exit(r.ok&&t.includes('ok')?0:1)}).catch(()=>process.exit(1))"

CMD ["node", "/app/docker/start.mjs"]
