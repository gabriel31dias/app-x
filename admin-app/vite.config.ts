import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";

// build vai pra ../admin, servido pelo serve.mjs em /admin/ (a API fica em /api, mesmo endereço)
export default defineConfig({
  base: "/admin/",
  server: {
    port: 8090,
    proxy: { "/api": { target: "http://localhost:3100", rewrite: (p) => p.replace(/^\/api/, ""), ws: true } },
  },
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: { outDir: "../admin", emptyOutDir: true },
});
