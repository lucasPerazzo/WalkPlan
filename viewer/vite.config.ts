/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Un paquete por biblioteca grande: el navegador los cachea por separado y un cambio en la app no
    // obliga a bajar de nuevo three ni la física (rapier trae su wasm adentro, ~2 MB).
    chunkSizeWarningLimit: 2600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Prioridad: cada grupo se lleva sus dependencias, así que los de abajo en la cadena van primero.
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 4 },
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 3 },
            { name: 'physics', test: /node_modules[\\/](@dimforge|@react-three[\\/]rapier)/, priority: 2 },
            { name: 'r3f', test: /node_modules[\\/](@react-three|three-stdlib|troika|maath|camera-controls|meshline|zustand|its-fine|suspend-react|react-use-measure|@monogrid|hls\.js|stats)/, priority: 1 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
