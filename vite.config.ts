import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { restrictedData } from "./scripts/vite/restrictedData.mjs";

export default defineConfig({
  plugins: [react(), restrictedData()],
  define: {
    global: "globalThis",
    "process.env": {},
  },
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, "index.html"),
        "ketcher-frame": resolve(__dirname, "ketcher-frame.html"),
      },
    },
  },
});
