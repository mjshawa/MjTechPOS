/**
 * Runs after `npm install`. On your own PC and in the GitHub installer build it prepares Electron's native
 * parts (better-sqlite3). Website hosts only need the web files, and compiling those native parts there can
 * fail or slow the build, so it is skipped on Netlify, Vercel, Cloudflare Pages and similar.
 */
const { execSync } = require('child_process');

const hosts = ['NETLIFY', 'VERCEL', 'CF_PAGES', 'RENDER', 'AWS_AMPLIFY', 'DEPLOY_PRIME_URL', 'WORKERS_CI'];
const host = hosts.find(k => process.env[k]);
if (host) {
  console.log(`[postinstall] website host detected (${host}): skipping Electron native setup`);
  process.exit(0);
}
execSync('npx --no-install electron-builder install-app-deps', { stdio: 'inherit' });
