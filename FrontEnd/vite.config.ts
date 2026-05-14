import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Client build configuration — API proxied to C# backend on :5000
export default defineConfig({
  plugins: [react()],
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
