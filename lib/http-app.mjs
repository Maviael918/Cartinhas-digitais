import {readFileSync} from 'node:fs';
import {randomBytes, randomInt, randomUUID, createHash, createHmac, scryptSync, timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLocalStore} from './local-store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const cleanText = (value, max = 80) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const bounded = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;

export function createRacker({password, dataDirectory = path.join(root, 'data'), secure = false, now = Date.now, store} = {}) {
  if (!password || password.length < 12 || password.length > 256) throw new Error('A senha do painel deve ter entre 12 e 256 caracteres.');
  const storage = store ?? createLocalStore(dataDirectory);
  const salt = randomBytes(16), passwordHash = scryptSync(password, salt, 32);
  const sessionHash = token => createHmac('sha256', password).update('racker-session:' + token).digest('hex');
  function allowed(req, action, max, duration) {
    return storage.consumeRate(sha(`${req.socket.remoteAddress}:${action}`), max, duration, now());
  }
  function send(res, status, value, headers = {}) {
    res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers});
    res.end(JSON.stringify(value));
  }
  async function json(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('Envie JSON.'), {status: 415});
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 16384) throw Object.assign(new Error('Envio muito grande.'), {status: 413});
    }
    try {
      const parsed = JSON.parse(body);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
      return parsed;
    } catch { throw Object.assign(new Error('JSON inválido.'), {status: 400}); }
  }
  async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if (req.headers.origin && req.headers.origin !== `${secure ? 'https' : 'http'}://${req.headers.host}`) return send(res, 403, {error: 'Origem não autorizada.'});
      if (!route.startsWith('/api/') && route !== '/health') {
        const staticFiles = {'/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css']};
        if (req.method !== 'GET' || !staticFiles[route]) return send(res, 404, {error: 'Página não encontrada.'});
        const [file, type] = staticFiles[route];
        res.writeHead(200, {'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache'});
        return res.end(readFileSync(path.join(root, file)));
      }
      await storage.cleanup(now());
      if (route === '/health' && req.method === 'GET') return send(res, 200, {ok: true, service: 'racker', apiVersion: 1, storage: storage.kind});
      if (route === '/api/login' && req.method === 'POST') {
        if (!await allowed(req, 'login', 8, 15 * 60000)) return send(res, 429, {error: 'Muitas tentativas. Aguarde 15 minutos.'});
        const body = await json(req);
        const submitted = scryptSync(typeof body.password === 'string' && body.password.length <= 256 ? body.password : '', salt, 32);
        if (!timingSafeEqual(submitted, passwordHash)) return send(res, 401, {error: 'Senha incorreta.'});
        const token = randomBytes(32).toString('hex');
        await storage.createSession(sessionHash(token), now() + 8 * 3600000);
        return send(res, 200, {ok: true}, {'Set-Cookie': `racker=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure ? '; Secure' : ''}`});
      }
      if (route === '/api/pair' && req.method === 'POST') {
        if (!await allowed(req, 'pair', 10, 15 * 60000)) return send(res, 429, {error: 'Muitas tentativas de pareamento.'});
        const body = await json(req);
        if (body.consent !== true) return send(res, 400, {error: 'Confirme o compartilhamento no aparelho.'});
        if (typeof body.code !== 'string' || !/^\d{8}$/.test(body.code)) return send(res, 400, {error: 'Código inválido ou expirado.'});
        const key = sha(body.code);
        const name = cleanText(body.name), model = cleanText(body.model);
        if (!name || !model) return send(res, 400, {error: 'Informe nome e modelo.'});
        const token = randomBytes(32).toString('hex'), id = randomUUID();
        const result = await storage.pairDevice(key, {id, name, model, tokenHash: sha(token), pairedAt: now(), lastSeen: null, latest: null, history: []}, now());
        if (!result.ok) return send(res, result.reason === 'DEVICE_LIMIT' ? 409 : 400, {error: result.reason === 'DEVICE_LIMIT' ? 'Limite de 10 aparelhos atingido.' : 'Código inválido ou expirado.'});
        return send(res, 201, {id, token});
      }
      if (route === '/api/telemetry' && req.method === 'POST') {
        const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
        if (!token) return send(res, 401, {error: 'Vínculo inválido ou revogado.'});
        if (!await allowed(req, 'telemetry', 120, 60000) || !await allowed(req, `telemetry:${sha(token)}`, 60, 60000)) return send(res, 429, {error: 'Aguarde antes de sincronizar.'});
        const b = await json(req);
        const sample = {
          timestamp: now(), battery: bounded(b.battery, 0, 100), charging: b.charging === true,
          network: ['wifi', 'cellular', 'ethernet', 'other', 'offline'].includes(b.network) ? b.network : 'other',
          androidVersion: cleanText(b.androidVersion, 20),
          location: b.location && bounded(b.location.latitude, -90, 90) !== null && bounded(b.location.longitude, -180, 180) !== null
            ? {latitude: b.location.latitude, longitude: b.location.longitude, accuracy: bounded(b.location.accuracy, 0, 100000), capturedAt: bounded(b.location.capturedAt, now() - 86400000, now() + 60000) ?? now()} : null
        };
        if (!await storage.ingest(sha(token), sample)) return send(res, 401, {error: 'Vínculo inválido ou revogado.'});
        return send(res, 200, {ok: true, receivedAt: sample.timestamp});
      }
      if (route.startsWith('/api/')) {
        const token = req.headers.cookie?.match(/(?:^|;\s*)racker=([a-f0-9]{64})(?:;|$)/)?.[1];
        const sessionKey = token && sessionHash(token);
        if (!sessionKey || !await storage.hasSession(sessionKey, now())) return send(res, 401, {error: 'Entre no painel para continuar.'});
        if (route === '/api/state' && req.method === 'GET') return send(res, 200, {devices: await storage.state(false, now()), serverTime: now(), storage: storage.kind});
        if (route === '/api/pairing' && req.method === 'POST') {
          await json(req);
          const code = String(randomInt(10000000, 100000000));
          const expires = now() + 5 * 60000;
          await storage.createPairing(sha(code), expires);
          return send(res, 201, {code, expires});
        }
        if (route === '/api/export' && req.method === 'GET') return send(res, 200, {exportedAt: now(), devices: await storage.state(true, now())}, {'Content-Disposition': 'attachment; filename="racker-dados.json"'});
        if (/^\/api\/devices\/[a-f0-9-]{36}$/.test(route) && req.method === 'DELETE') {
          await json(req);
          const id = route.split('/').pop();
          if (!await storage.removeDevice(id)) return send(res, 404, {error: 'Aparelho não encontrado.'});
          return send(res, 200, {ok: true});
        }
        if (route === '/api/logout' && req.method === 'POST') {
          await json(req);
          await storage.deleteSession(sessionKey);
          return send(res, 200, {ok: true}, {'Set-Cookie': 'racker=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
        }
        return send(res, 404, {error: 'Rota não encontrada.'});
      }
      return send(res, 404, {error: 'Rota não encontrada.'});
    } catch (error) {
      if (!res.headersSent) send(res, error.status ?? 500, {error: error.status ? error.message : 'Erro interno ao salvar ou processar os dados.', code: error.code === 'PAIRING_DATABASE_UPDATE_REQUIRED' ? error.code : undefined});
      else res.end();
    }
  }
  return handler;
}

