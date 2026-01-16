import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const arkProxyPlugin = (arkApiKey?: string) => ({
  name: 'ark-proxy',
  configureServer(server: any) {
    server.middlewares.use('/api/ark/responses', (req: any, res: any) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return;
      }
      const chunks: Buffer[] = [];
      const requestTimeout = setTimeout(() => {
        res.statusCode = 504;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Ark proxy timeout');
      }, 90000);

      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      req.on('aborted', () => {
        clearTimeout(requestTimeout);
      });
      req.on('error', (error: Error) => {
        clearTimeout(requestTimeout);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end(`Ark proxy request error: ${error.message}`);
      });
      req.on('end', async () => {
        clearTimeout(requestTimeout);
        if (!arkApiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain');
          res.end('ARK_API_KEY missing');
          return;
        }
        const body = Buffer.concat(chunks).toString('utf8');
        const start = Date.now();
        console.info('[ArkProxy] request start', { size: body.length });
        try {
          const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${arkApiKey}`,
              'Content-Type': 'application/json',
            },
            body,
          });
          res.statusCode = response.status;
          const contentType = response.headers.get('content-type');
          if (contentType) {
            res.setHeader('Content-Type', contentType);
          }
          const requestId = response.headers.get('x-request-id');
          if (requestId) {
            res.setHeader('x-request-id', requestId);
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          res.setHeader('Content-Length', buffer.length);
          res.end(buffer);
          console.info('[ArkProxy] response sent', { status: response.status, elapsedMs: Date.now() - start });
        } catch (error: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain');
          res.end(`Ark proxy request failed: ${error?.message || 'unknown error'}`);
          console.warn('[ArkProxy] request failed', { elapsedMs: Date.now() - start, error: error?.message || error });
        }
      });
    });
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const arkApiKey = env.ARK_API_KEY || env.VITE_ARK_API_KEY;
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), arkProxyPlugin(arkApiKey)],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
