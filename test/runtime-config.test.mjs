import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectStorageMode} from '../lib/runtime-config.mjs';

test('o servidor seleciona Supabase automaticamente quando uma credencial é configurada',()=>{
  assert.equal(selectStorageMode({}),'local');
  assert.equal(selectStorageMode({SUPABASE_SECRET_KEY:'sb_secret_test_only'}),'supabase');
  assert.equal(selectStorageMode({SUPABASE_SERVICE_ROLE_KEY:'legacy-test-only'}),'supabase');
  assert.equal(selectStorageMode({RACKER_STORAGE:'auto',SUPABASE_SECRET_KEY:'sb_secret_test_only'}),'supabase');
  assert.equal(selectStorageMode({SUPABASE_SECRET_KEY:'  '}),'local');
});

test('modo explícito é respeitado e configurações inválidas são recusadas',()=>{
  assert.equal(selectStorageMode({RACKER_STORAGE:'local',SUPABASE_SECRET_KEY:'sb_secret_test_only'}),'local');
  assert.equal(selectStorageMode({RACKER_STORAGE:'supabase'}),'supabase');
  assert.throws(()=>selectStorageMode({RACKER_STORAGE:'outro'}),/RACKER_STORAGE/);
});
