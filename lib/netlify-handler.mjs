import {Readable} from 'node:stream';
import {createRacker} from './http-app.mjs';
import {createSupabaseStore} from './supabase-store.mjs';

// Netlify supplies Web Requests. This adapter retains the exact API used by the
// local Node server and the existing Android APK, without a second implementation.
export function createNetlifyHandler({env = process.env, fetchImpl = fetch, now = Date.now} = {}) {
  const handlers = new Map();
  return async (request, context = {}) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/health') return Response.json({error: 'Rota não encontrada.'}, {status: 404});
    const secure = url.protocol === 'https:';
    if (!secure && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return Response.json({error: 'HTTPS obrigatório.'}, {status: 400});
    let handler = handlers.get(secure);
    if (!handler) {
      try {
        const store = createSupabaseStore({url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl});
        handler = createRacker({password: env.ADMIN_PASSWORD, store, secure, now});
        handlers.set(secure, handler);
      } catch {
        return Response.json({error: 'O servidor ainda não foi configurado para acessar o banco de dados.', code: 'CONFIGURATION_REQUIRED'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
      }
    }
    const req = request.body ? Readable.fromWeb(request.body) : Readable.from([]);
    req.url = url.pathname + url.search;
    req.method = request.method;
    req.headers = Object.fromEntries(request.headers);
    req.headers.host = url.host;
    // Only the platform context is trusted for rate limits; client headers are ignored.
    req.socket = {remoteAddress: typeof context.ip === 'string' ? context.ip : 'unknown'};
    let status = 200, payload = null;
    const headers = new Headers();
    const res = {
      headersSent: false,
      setHeader(name, value) { headers.set(name, String(value)); },
      writeHead(code, values = {}) { status = code; for (const [name, value] of Object.entries(values)) headers.set(name, String(value)); this.headersSent = true; },
      end(value) { payload = value ?? null; this.headersSent = true; }
    };
    await handler(req, res);
    return new Response(payload, {status, headers});
  };
}
