import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import path from 'node:path';

// Local development keeps the original devices.json format.
export function createLocalStore(dataDirectory) {
  mkdirSync(dataDirectory, {recursive: true});
  const file = path.join(dataDirectory, 'devices.json');
  let db = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {devices: []};
  if (!Array.isArray(db.devices)) throw new Error('Arquivo de dados inválido.');
  const sessions = new Map(), pairing = new Map(), limits = new Map();
  function persist() {
    writeFileSync(file + '.tmp', JSON.stringify(db), {mode: 0o600});
    renameSync(file + '.tmp', file);
  }
  return {
    kind: 'local',
    cleanup(now) {
      for (const map of [sessions, pairing]) for (const [key, value] of map) if (value.expires <= now) map.delete(key);
      for (const [key, value] of limits) if (value.until <= now) limits.delete(key);
      let changed = false;
      for (const d of db.devices) {
        const retained = d.history.filter(s => s.timestamp > now - 30 * 86400000);
        if (retained.length !== d.history.length) { d.history = retained; changed = true; }
        if (d.latest && d.latest.timestamp <= now - 30 * 86400000) { d.latest = null; changed = true; }
      }
      if (changed) persist();
    },
    consumeRate(key, max, duration, now) {
      const entry = limits.get(key);
      if (!entry || entry.until <= now) { limits.set(key, {count: 1, until: now + duration}); return true; }
      return ++entry.count <= max;
    },
    createSession(hash, expires) {
      if (sessions.size >= 1024) sessions.delete(sessions.keys().next().value);
      sessions.set(hash, {expires});
    },
    hasSession(hash, now) { return (sessions.get(hash)?.expires ?? 0) > now; },
    deleteSession(hash) { sessions.delete(hash); },
    createPairing(hash, expires) { pairing.clear(); pairing.set(hash, {expires}); },
    pairDevice(hash, device, now) {
      if ((pairing.get(hash)?.expires ?? 0) <= now) return {ok: false, reason: 'INVALID_CODE'};
      if (db.devices.length >= 10) return {ok: false, reason: 'DEVICE_LIMIT'};
      db.devices.push(device);
      try { persist(); } catch (error) { db.devices.pop(); throw error; }
      pairing.delete(hash);
      return {ok: true};
    },
    ingest(tokenHash, sample) {
      const device = db.devices.find(d => d.tokenHash === tokenHash);
      if (!device) return false;
      device.latest = sample;
      device.lastSeen = sample.timestamp;
      device.history = [...device.history.filter(s => s.timestamp > sample.timestamp - 30 * 86400000), sample].slice(-1000);
      persist();
      return true;
    },
    state(full = false) {
      return db.devices.map(({tokenHash, ...d}) => ({...d, history: full ? d.history : d.history.slice(-120)}));
    },
    removeDevice(id) {
      if (!db.devices.some(d => d.id === id)) return false;
      db.devices = db.devices.filter(d => d.id !== id);
      persist();
      return true;
    }
  };
}
