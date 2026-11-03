/**
 * Used by .github/workflows/build.yml before the Windows build:
 *  - points the auto-updater at THIS GitHub repository (so nobody has to type owner/repo), and
 *  - when the build was started by a tag such as v1.0.3, uses 1.0.3 as the app version.
 */
const fs = require('fs');
const file = process.argv[2] || 'package.json';
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
if (!owner || !repo) { console.error('GITHUB_REPOSITORY is not set'); process.exit(1); }
pkg.build.publish = [{ provider: 'github', owner, repo, releaseType: 'release' }];
if (process.env.GITHUB_REF_TYPE === 'tag') pkg.version = process.env.GITHUB_REF_NAME.replace(/^v/, '');
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
console.log(`update feed: github.com/${owner}/${repo}, version ${pkg.version}`);
