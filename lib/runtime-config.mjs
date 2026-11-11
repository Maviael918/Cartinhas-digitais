export function selectStorageMode(env = process.env) {
  const mode = env.RACKER_STORAGE || 'auto';
  if (!['auto', 'local', 'supabase'].includes(mode)) throw new Error('RACKER_STORAGE deve ser auto, local ou supabase.');
  if (mode !== 'auto') return mode;
  return env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() ? 'supabase' : 'local';
}
