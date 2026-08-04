import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 40,
            },
            {
              name: 'vendor-rapier-engine',
              test: /node_modules[\\/]@dimforge[\\/]rapier3d-compat[\\/]/,
              priority: 35,
            },
            {
              name: 'vendor-rapier',
              test: /node_modules[\\/]@react-three[\\/]rapier[\\/]/,
              priority: 30,
            },
            {
              name: 'vendor-r3f',
              test: /node_modules[\\/]@react-three[\\/](fiber|drei)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-three',
              test: /node_modules[\\/](three|three-mesh-bvh)[\\/]/,
              priority: 10,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 0,
            },
          ],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
