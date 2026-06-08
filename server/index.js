// Production web server for Quant Poker Trainer.
// Serves the built Vite front-end AND hosts the API you'll grow into
// (user auth, shared leaderboard, etc.). Deployed on Render as a Node web service.
import express from "express";
import compression from "compression";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");

const app = express();
app.use(compression());
app.use(express.json());

// ---------------------------------------------------------------------------
// API. Add real endpoints here as the app grows, e.g.
//   app.post("/api/auth/login", ...)
//   app.get("/api/leaderboard", ...)  /  app.post("/api/scores", ...)
// A database plugs in here too (e.g. a Render Postgres instance exposed via the
// DATABASE_URL environment variable).
// ---------------------------------------------------------------------------
const api = express.Router();
api.get("/health", (_req, res) => res.json({ ok: true, service: "quantpoker" }));
// Placeholder so the leaderboard UI has something to call during development.
api.get("/leaderboard", (_req, res) => res.json({ entries: [] }));
app.use("/api", api);

// Serve the built front-end. Hashed assets cache forever; index.html never caches
// so new deploys are picked up immediately.
app.use(
  express.static(distDir, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
      else res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  })
);

// SPA fallback: any non-API GET returns index.html (version-safe; no wildcard route).
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(distDir, "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Quant Poker server listening on http://0.0.0.0:${port}`);
});

// ---------------------------------------------------------------------------
// Keep-warm self-ping: prevents Render's free-tier 15-minute idle spin-down by
// hitting our own PUBLIC url on an interval (an outbound request to the public URL
// comes back as inbound traffic, resetting the idle timer).
//
// On Render, RENDER_EXTERNAL_URL is injected automatically, so this turns on in
// production with no config. Set KEEP_ALIVE=false to disable, KEEP_ALIVE_MS to retune.
// Note: this only keeps it warm while running; an external pinger (see
// .github/workflows/keep-alive.yml) is what can WAKE it if it ever does sleep.
// ---------------------------------------------------------------------------
const keepAliveTarget =
  process.env.KEEP_ALIVE_URL ||
  (process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/api/health` : null);

if (keepAliveTarget && process.env.KEEP_ALIVE !== "false") {
  const intervalMs = Number(process.env.KEEP_ALIVE_MS) || 10 * 60 * 1000; // 10 min < 15 min window
  console.log(`[keep-alive] self-ping every ${Math.round(intervalMs / 1000)}s -> ${keepAliveTarget}`);
  const timer = setInterval(() => {
    fetch(keepAliveTarget, { headers: { "user-agent": "quantpoker-keepalive" } })
      .then((r) => console.log(`[keep-alive] ${keepAliveTarget} -> ${r.status}`))
      .catch((e) => console.warn(`[keep-alive] ping failed: ${e.message}`));
  }, intervalMs);
  timer.unref?.(); // don't let the timer alone hold the process open
}
