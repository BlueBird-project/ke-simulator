import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Loads ALL env vars (not just VITE_-prefixed ones), so ENTSOE_API_TOKEN
  // stays available here, server-side, without ever being exposed to
  // import.meta.env in client code.
  const env = loadEnv(mode, '.', '')
  const entsoeToken = env.ENTSOE_API_TOKEN ?? ''

  return {
    plugins: [react()],
    server: {
      port: 5173,
      open: true,
      proxy: {
        // Frontend calls /entsoe-api?<public query params>; the secret
        // token is injected here before forwarding to the real ENTSO-E API,
        // so it never reaches the browser bundle or the network tab.
        '/entsoe-api': {
          target: 'https://web-api.tp.entsoe.eu',
          changeOrigin: true,
          rewrite: (path: string) => {
            const [, query = ''] = path.split('?')
            const params = new URLSearchParams(query)
            if (entsoeToken) {
              params.set('securityToken', entsoeToken)
            }
            return `/api?${params.toString()}`
          }
        }
      }
    }
  }
})
