import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Hosts allowed when running a Vite server (`vite` dev or `vite preview`).
// A leading dot matches the domain and all its subdomains.
// NOTE: the recommended Render deploy is a *Static Site* (serves ./dist via CDN),
// in which case no Vite server runs and this has no effect — it's just a safety net.
const allowedHosts = [".onrender.com"];

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts,
  },
  preview: {
    host: true,
    allowedHosts,
  },
});
