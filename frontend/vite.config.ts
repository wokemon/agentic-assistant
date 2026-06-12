import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.VITE_API_BASE_URL ?? "http://localhost:3105";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: backend,
        changeOrigin: true,
      },
    },
  },
});
