import {defaultSupabaseUrl} from '../config/supabase.mjs';

export function createSupabaseStore({url = defaultSupabaseUrl, secretKey, fetchImpl = fetch} = {}) {
  let parsed;
  try { parsed = new URL(url); }
  catch { throw Object.assign(new Error('SUPABASE_URL deve ser a origem HTTPS do projeto.'), {configurationField: 'SUPABASE_URL'}); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    throw Object.assign(new Error('SUPABASE_URL deve ser a origem HTTPS do projeto.'), {configurationField: 'SUPABASE_URL'});
  }
  secretKey = typeof secretKey === 'string' ? secretKey.trim() : '';
  // Public/anon credentials cannot invoke Racker's server-only database functions.
  const legacyRole = secretKey?.startsWith('eyJ') ? (() => {
    try { return JSON.parse(Buffer.from(secretKey.split('.')[1], 'base64url')).role; } catch { return null; }
  })() : null;
  if (!secretKey || (!secretKey.startsWith('sb_secret_') && legacyRole !== 'service_role')) {
    throw Object.assign(new Error('Configure SUPABASE_SECRET_KEY com uma chave secreta do servidor; uma chave pública não permite acessar esta API.'), {configurationField: 'SUPABASE_SECRET_KEY'});
  }
  async function rpc(name, args = {}) {
    const headers = {'Content-Type': 'application/json', apikey: secretKey};
    if (legacyRole === 'service_role') headers.Authorization = `Bearer ${secretKey}`;
    let response;
    try {
      response = await fetchImpl(`${parsed.origin}/rest/v1/rpc/${name}`, {method: 'POST', headers, body: JSON.stringify(args), signal: AbortSignal.timeout(10000)});
    } catch { throw Object.assign(new Error('Não foi possível conectar ao Supabase.'), {status: 503}); }
    if (!response.ok) {
      // Never return database errors, credentials or legacy project data to callers.
      throw Object.assign(new Error('Supabase indisponível ou migração Racker não aplicada. Verifique a configuração do servidor.'), {status: 503});
    }
    if (response.status === 204) return null;
    try { return await response.json(); }
    catch { throw Object.assign(new Error('Resposta inválida do banco de dados.'), {status: 503}); }
  }
  return {
    kind: 'supabase',
    cleanup: now => rpc('racker_cleanup', {p_now: now}),
    consumeRate: (key, max, duration, now) => rpc('racker_rate_limit', {p_key: key, p_max: max, p_duration: duration, p_now: now}),
    createSession: (hash, expires) => rpc('racker_set_session', {p_hash: hash, p_expires: expires}),
    hasSession: (hash, now) => rpc('racker_session_valid', {p_hash: hash, p_now: now}),
    deleteSession: hash => rpc('racker_logout', {p_hash: hash}),
    createPairing: (hash, expires) => rpc('racker_create_pairing', {p_hash: hash, p_expires: expires}),
    pairDevice: (hash, device, now) => rpc('racker_pair_device', {p_hash: hash, p_device: device, p_now: now}),
    ingest: (hash, sample) => rpc('racker_ingest', {p_hash: hash, p_sample: sample}),
    state: (full, now) => rpc('racker_state', {p_full: full, p_now: now}),
    removeDevice: id => rpc('racker_remove_device', {p_id: id})
  };
}
