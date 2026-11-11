import http from 'node:http';
import https from 'node:https';
import {readFileSync, existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRacker} from './lib/http-app.mjs';
import {createSupabaseStore} from './lib/supabase-store.mjs';
import {selectStorageMode} from './lib/runtime-config.mjs';
export {createRacker} from './lib/http-app.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (existsSync(path.join(root, '.env'))) loadEnvFile(path.join(root, '.env'));
  const password = process.env.ADMIN_PASSWORD || randomBytes(18).toString('base64url');
  const secure = !!(process.env.TLS_CERT && process.env.TLS_KEY);
  const storageMode = selectStorageMode(process.env);
  const store = storageMode === 'supabase' ? createSupabaseStore({url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY}) : undefined;
  const handler = createRacker({password, secure, dataDirectory: process.env.DATA_DIR, store});
  const server = secure ? https.createServer({cert: readFileSync(process.env.TLS_CERT), key: readFileSync(process.env.TLS_KEY)}, handler) : http.createServer(handler);
  const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 3000);
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(port, host, () => {
    console.log(`Racker: ${secure ? 'https' : 'http'}://${host}:${port}`);
    console.log(`Armazenamento: ${storageMode}`);
    if(storageMode==='local')console.log('Modo de desenvolvimento local. Para conectar ao Supabase, configure SUPABASE_SECRET_KEY no ambiente privado.');
    if (!process.env.ADMIN_PASSWORD) console.log(`Senha temporária do painel: ${password}`);
    console.log('Ctrl+C para encerrar. Configure ADMIN_PASSWORD para manter sua senha.');
  });
}
