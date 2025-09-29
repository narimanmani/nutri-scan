import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { createRequire } from 'module'

function createNetlifyFunctionProxyPlugin() {
  const require = createRequire(import.meta.url)
  let handlerModule

  try {
    handlerModule = require('./netlify/functions/api.js')
  } catch (error) {
    console.warn('[vite] Unable to load Netlify function handler for local proxying.', error)
    return { name: 'netlify-function-proxy-disabled' }
  }

  const handler = handlerModule?.handler
  if (typeof handler !== 'function') {
    return { name: 'netlify-function-proxy-disabled' }
  }

  const readRequestBody = (req) =>
    new Promise((resolve, reject) => {
      const chunks = []

      req.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk))
      })

      req.on('end', () => {
        if (chunks.length === 0) {
          resolve(undefined)
          return
        }

        resolve(Buffer.concat(chunks).toString())
      })

      req.on('error', (err) => {
        reject(err)
      })
    })

  const mountPaths = ['/api', '/.netlify/functions/api']

  const createMiddleware = (server, mountPath) =>
    async (req, res) => {
      try {
        const body = await readRequestBody(req)
        const relativePath = req.url || '/'

        const event = {
          path: `/.netlify/functions/api${relativePath}`,
          rawUrl: `http://localhost${mountPath}${relativePath}`,
          httpMethod: req.method || 'GET',
          headers: req.headers,
          body,
          isBase64Encoded: false,
        }

        const result = await handler(event)

        res.statusCode = result?.statusCode ?? 200

        const headers = result?.headers || {}
        Object.entries(headers).forEach(([key, value]) => {
          if (typeof value !== 'undefined') {
            res.setHeader(key, value)
          }
        })

        const responseBody = result?.body ?? ''
        res.end(responseBody)
      } catch (error) {
        server.config.logger.error(
          `[netlify-function-proxy] Failed to invoke api function: ${error?.stack || error}`
        )

        if (!res.headersSent) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
        }

        res.end(JSON.stringify({ error: 'Local Netlify function proxy failed.' }))
      }
    }

  return {
    name: 'netlify-function-proxy',
    configureServer(server) {
      mountPaths.forEach((mountPath) => {
        server.middlewares.use(mountPath, createMiddleware(server, mountPath))
      })
    },
  }
}

export default defineConfig(({ command }) => ({
  plugins: command === 'serve' ? [react(), createNetlifyFunctionProxyPlugin()] : [react()],
  server: {
    allowedHosts: true,
    proxy: {
      '/wger': {
        target: 'https://wger.de',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/wger/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx', '.json'],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
}))
