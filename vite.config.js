import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // .env は vite.config.js と同じフォルダから読む
  const env = loadEnv(mode, __dirname, '');
  const anthropicKey = (env.ANTHROPIC_API_KEY || env.VITE_ANTHROPIC_API_KEY || '').trim();
  const geminiKey = (env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '').trim();
  if (!anthropicKey && !geminiKey && mode === 'development') {
    console.warn('\n[Paper Manager] AI抽出用のAPIキーがありません。.env に次のいずれかを追加：');
    console.warn('  ANTHROPIC_API_KEY=sk-ant-...  （有料）');
    console.warn('  GEMINI_API_KEY=...          （無料: https://aistudio.google.com/apikey ）\n');
  }
  return {
    plugins: [react()],
    root: '.',
    base: './', // スタンドアロン: どの端末・フォルダから開いても相対パスで動作
    server: {
      proxy: {
        '/api/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (pathName) => pathName.replace(/^\/api\/anthropic/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('x-api-key', anthropicKey);
              proxyReq.setHeader('anthropic-version', '2023-06-01');
            });
          },
        },
        '/api/gemini': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          rewrite: (pathName) => pathName.replace(/^\/api\/gemini/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (!proxyReq.path.includes('key=')) {
                const sep = proxyReq.path.includes('?') ? '&' : '?';
                proxyReq.path = proxyReq.path + sep + 'key=' + encodeURIComponent(geminiKey);
              }
            });
          },
        },
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
