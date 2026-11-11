import {mkdirSync, lstatSync, rmSync, copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.resolve(root, 'dist');
const assets = ['index.html', 'app.js', 'styles.css'];
if (path.dirname(directory) !== root || path.basename(directory) !== 'dist') throw new Error('Destino de build inválido.');
const previous = lstatSync(directory, {throwIfNoEntry: false});
if (previous && (!previous.isDirectory() || previous.isSymbolicLink())) throw new Error('dist/ deve ser uma pasta local de artefatos, sem links.');
// dist is generated output. Rebuild it from the allowlist so provider caches
// cannot fail the build or accidentally publish files left by an older build.
rmSync(directory, {recursive: true, force: true});
mkdirSync(directory, {recursive: true});
for (const file of assets) copyFileSync(path.join(root, file), path.join(directory, file));
console.log('Painel real preparado em dist/. A API será publicada como Netlify Function.');
