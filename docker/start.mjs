import { spawn } from "node:child_process";
import http from "node:http";

const API_PORT = 8000;
const WEB_PORT = 3001;
const PUBLIC_PORT = Number(process.env.PORT || 3000);
const UPSTREAM_TIMEOUT_MS = 15 * 60 * 1000;
const SHUTDOWN_GRACE_MS = 10_000;

if (!Number.isInteger(PUBLIC_PORT) || PUBLIC_PORT < 1 || PUBLIC_PORT > 65535) {
  console.error("PORT must be an integer from 1 to 65535");
  process.exit(1);
}
if (PUBLIC_PORT === API_PORT || PUBLIC_PORT === WEB_PORT) {
  console.error(`PORT ${PUBLIC_PORT} conflicts with an internal service port`);
  process.exit(1);
}

const children = [];
let shuttingDown = false;
let exitCode = 0;

function isBackendPath(requestUrl = "/") {
  const path = requestUrl.split("?")[0];
  return ["/health", "/model", "/pricing"].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function dropHopHeaders(headers) {
  const forwarded = { ...headers };
  for (const name of [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]) {
    delete forwarded[name];
  }
  return forwarded;
}

function proxy(req, res, target) {
  const headers = dropHopHeaders(req.headers);
  headers.host = req.headers.host || `127.0.0.1:${PUBLIC_PORT}`;
  const upstream = http.request(
    {
      host: target.host,
      port: target.port,
      method: req.method,
      path: req.url,
      headers,
      timeout: UPSTREAM_TIMEOUT_MS,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, dropHopHeaders(upstreamRes.headers));
      upstreamRes.pipe(res);
    },
  );
  upstream.on("timeout", () => upstream.destroy());
  upstream.on("error", () => {
    if (res.headersSent || res.writableEnded) return;
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ detail: "Upstream unavailable" }));
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const target = isBackendPath(req.url)
    ? { host: "127.0.0.1", port: API_PORT }
    : { host: "127.0.0.1", port: WEB_PORT };
  proxy(req, res, target);
});

function signalChildren(signal) {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  }
}

function shutdown(fromSignal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("shutting down");
  server.close();
  signalChildren("SIGTERM");
  const killer = setTimeout(() => signalChildren("SIGKILL"), SHUTDOWN_GRACE_MS);
  const watcher = setInterval(() => {
    const stopped = children.every(
      (child) => child.exitCode !== null || child.signalCode !== null,
    );
    if (!stopped) return;
    clearInterval(watcher);
    clearTimeout(killer);
    process.exit(fromSignal ? 0 : exitCode || 1);
  }, 100);
}

function track(child, name) {
  children.push(child);
  child.on("error", (error) => {
    console.error(`${name} failed to start: ${error.message}`);
    exitCode = 1;
    shutdown(false);
  });
  child.on("exit", (code, signal) => {
    console.log(`${name} exited (${signal || code})`);
    if (!shuttingDown) {
      exitCode = code === 0 ? 0 : code || 1;
      shutdown(false);
    }
  });
}

track(
  spawn(
    "/opt/venv/bin/uvicorn",
    ["app.main:app", "--host", "0.0.0.0", "--port", String(API_PORT)],
    { cwd: "/app/backend", stdio: "inherit" },
  ),
  "fastapi",
);

track(
  spawn("node", ["server.js"], {
    cwd: "/app/frontend",
    stdio: "inherit",
    env: { ...process.env, PORT: String(WEB_PORT), HOSTNAME: "127.0.0.1" },
  }),
  "frontend",
);

server.listen(PUBLIC_PORT, "0.0.0.0", () => {
  console.log(`public origin listening on 0.0.0.0:${PUBLIC_PORT}`);
});

process.on("SIGTERM", () => shutdown(true));
process.on("SIGINT", () => shutdown(true));
