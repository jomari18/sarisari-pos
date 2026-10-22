import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import { VitePWA } from "vite-plugin-pwa";
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
    plugins: [
      react(),
      tailwindcss(),
      // Spec 9: the app shell, fonts and icons are precached so the app opens offline. API answers are never
      // cached by the service worker; the catalog snapshot and the sales queue live in IndexedDB instead.
      VitePWA({
        // The same minified worker whatever NODE_ENV the build runs under (Netlify, a test, a laptop).
        mode: "production",
        registerType: "autoUpdate",
        injectRegister: false,
        manifest: {
          name: "ZariZari",
          short_name: "ZariZari",
          description: "Point of sale, inventory and utang for sari-sari stores, online or offline.",
          start_url: "/app",
          scope: "/",
          display: "standalone",
          background_color: "#111315",
          theme_color: "#111315",
          // Task 34's brand pass replaces these with the final mark and PNG sizes.
          icons: [
            { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
            { src: "/icons/maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
          ],
        },
        workbox: {
          // The manifest and its icons are added by the plugin itself.
          globPatterns: ["**/*.{js,css,html,woff2}"],
          // The landing's 3D scene (three.js) is fetched only where it plays, never in the background for the POS.
          globIgnores: ["**/Tindahan3D-*.js"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [],
          cleanupOutdatedCaches: true,
          // The plugin turns these on by itself only when it injects the registration; main.tsx registers instead.
          // Without them a new version waits behind the old one until every tab is closed.
          skipWaiting: true,
          clientsClaim: true,
        },
      }),
    ],
    resolve: {
      alias: { "@sari/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)) },
    },
    server: { port: 5173, proxy: { "/api": api } },
    preview: { port: 4173, proxy: { "/api": api } },
  };
});
