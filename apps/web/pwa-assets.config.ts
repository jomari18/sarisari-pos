import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// The PWA icons (spec 11.5), made from the favicon's dark tile: `npm run icons -w @sari/web` writes the PNGs and
// favicon.ico into public/. Maskable and Apple icons sit on the same dark colour, so the tile's corners vanish.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: "#111315" } },
    apple: { ...minimal2023Preset.apple, padding: 0.15, resizeOptions: { background: "#111315" } },
  },
  images: ["public/favicon.svg"],
});
