import {mkdirSync, readFileSync, writeFileSync, copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(path.join(root, 'dist'), {recursive: true});
for (const file of ['app.js', 'styles.css']) copyFileSync(path.join(root, file), path.join(root, 'dist', file));
const html = readFileSync(path.join(root, 'index.html'), 'utf8').replace('data-demo="false"', 'data-demo="true"');
writeFileSync(path.join(root, 'dist/index.html'), html);
console.log('Prévia estática criada em dist/. Dados fictícios sinalizados; sem coleta.');
