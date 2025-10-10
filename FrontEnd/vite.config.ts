import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import type { Plugin } from "vite";
// import { createServer as createApiServer } from "./server"; // Disabled - using C# backend

// Attach Express API to Vite dev server for local development (DISABLED - using C# backend)
function apiMiddlewarePlugin(): Plugin {
  return {
    name: "fusion-api-middleware",
    configureServer(server) {
      // Disabled: using C# backend via proxy instead
      // const app = createApiServer();
      // server.middlewares.use(app);
    },
  };
}

// Client build configuration
export default defineConfig({
  plugins: [react(), apiMiddlewarePlugin()],
  build: {
    outDir: "dist/spa",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
});
