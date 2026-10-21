import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import { netlifySignature } from "./dev/proxySign";

/** The secret docker-compose gives the local API. The real one exists only in Netlify and Render settings. */
const LOCAL_PROXY_SECRET = "local-only-proxy-signing-secret-01234567";

export default defineConfig(({ mode }) => {
  const secret = loadEnv(mode, process.cwd(), "").PROXY_SIGNING_SECRET || LOCAL_PROXY_SECRET;
  // Locally, Vite stands in for Netlify's signed proxy: same origin for the app, /api forwarded and signed.
  const api: ProxyOptions = {
    target: "http://localhost:8080",
    configure: (proxy) => {
      proxy.on("proxyReq", (request) => request.setHeader("x-nf-sign", netlifySignature(secret)));
    },
  };
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@sari/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)) },
    },
    server: { port: 5173, proxy: { "/api": api } },
    preview: { port: 4173, proxy: { "/api": api } },
  };
});
