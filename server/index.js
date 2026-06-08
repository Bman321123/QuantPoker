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
