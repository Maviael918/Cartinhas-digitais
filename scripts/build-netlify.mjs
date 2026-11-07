import {mkdirSync, readdirSync, copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'dist');
mkdirSync(directory, {recursive: true});
const assets = ['index.html', 'app.js', 'styles.css'];
for (const file of readdirSync(directory)) {
  if (!assets.includes(file)) throw new Error('dist/ contém arquivos inesperados. Revise a pasta antes de publicar.');
}
for (const file of assets) copyFileSync(path.join(root, file), path.join(directory, file));
console.log('Painel real preparado em dist/. A API será publicada como Netlify Function.');
