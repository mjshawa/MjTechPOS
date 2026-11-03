import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * PWA: after the build, list every emitted file and write dist/sw.js from pwa/sw.template.js.
 * The build id is a hash of the file contents, so the service worker file changes (and installed copies
 * offer an update) exactly when something in the app changed. No extra dependencies needed.
 */
function pwaServiceWorker(): Plugin {
  let root = process.cwd();
  let outDir = path.resolve(root, 'dist');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });

  return {
    name: 'mjtech-pwa-service-worker',
    apply: 'build',
    configResolved(cfg) { root = cfg.root; outDir = path.resolve(cfg.root, cfg.build.outDir); },
    closeBundle() {
      if (!fs.existsSync(path.join(outDir, 'index.html'))) return; // build failed, nothing to do
      const files = walk(outDir)
        .map(f => path.relative(outDir, f).split(path.sep).join('/'))
        .filter(f => f !== 'sw.js' && !f.endsWith('.map'))
        .sort();
      const hash = createHash('sha1');
      for (const f of files) { hash.update(f); hash.update(fs.readFileSync(path.join(outDir, f))); }
      const buildId = hash.digest('hex').slice(0, 10);
      const urls = files.map(f => './' + f);
      const tpl = fs.readFileSync(path.resolve(root, 'pwa/sw.template.js'), 'utf8');
      fs.writeFileSync(
        path.join(outDir, 'sw.js'),
        tpl.replace('__BUILD_ID__', buildId).replace('__PRECACHE_URLS__', JSON.stringify(urls, null, 2))
      );
      console.log(`\n[pwa] sw.js written: ${urls.length} files precached, build ${buildId}`);
    },
  };
}

// base './' so the built files also load from file:// (Electron), the Capacitor WebView, and any sub-folder on a web host.
export default defineConfig({
  plugins: [react(), pwaServiceWorker()],
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
