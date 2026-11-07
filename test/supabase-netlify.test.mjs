import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createNetlifyHandler} from '../lib/netlify-handler.mjs';

const migration = readFileSync(new URL('../supabase/migrations/202611060001_racker.sql', import.meta.url), 'utf8');

test('Supabase e Netlify: persistência, isolamento e revogação entre instâncias', async t => {
  const db = await PGlite.create();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create table public.unrelated_records(id integer primary key, title text);
    insert into public.unrelated_records values (1, 'Registro independente');
  `);
  let clock = Date.now(), cookie, code, deviceToken, deviceId;
  const env = {ADMIN_PASSWORD: 'senha-cloud-de-teste-123456', SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_only_for_local_tests'};
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.match(url, /^https:\/\/test.supabase.co\/rest\/v1\/rpc\/racker_[a-z_]+$/);
    assert.equal(options.headers.apikey, env.SUPABASE_SECRET_KEY);
    assert.equal(options.headers.Authorization, undefined, 'Chave secreta nova usa somente apikey.');
    const name = url.split('/').pop(), args = JSON.parse(options.body);
    const keys = Object.keys(args);
    for (const key of keys) assert.match(key, /^p_[a-z_]+$/);
    const sql = `select public.${name}(${keys.map((key,i)=>`${key} => $${i+1}`).join(',')}) as result`;
    const values = Object.values(args).map(value => value && typeof value === 'object' ? JSON.stringify(value) : value);
    try {
      const result = await db.query(sql, values);
      return Response.json(result.rows[0].result);
    } catch(error) {
      // Surface only a fake upstream error; production intentionally hides SQL details.
      throw new Error(`RPC ${name} falhou no PostgreSQL de teste: ${error.message}`, {cause:error});
    }
  };
  const fresh = () => createNetlifyHandler({env, fetchImpl, now:()=>clock});
  let a = fresh(), b = fresh();
  const call = async (handler, route, {method='GET', body, auth=false, token, ip='198.51.100.10', headers:extra={}}={}) => {
    const headers = {...extra};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(auth)headers.Cookie=cookie;
    if(token)headers.Authorization='Bearer '+token;
    const response=await handler(new Request('https://racker.example'+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),{ip});
    return {status:response.status,body:await response.json(),headers:response.headers};
  };
  try {
    await t.test('migração é aditiva e pode ser aplicada novamente',async()=>{
      await db.exec(migration);
      await db.exec(migration);
      assert.equal((await db.query('select title from public.unrelated_records')).rows[0].title,'Registro independente');
      const funcs=await db.query("select prosecdef, proconfig from pg_proc where proname like 'racker_%'");
      assert.equal(funcs.rows.length,10);
      assert.ok(funcs.rows.every(f=>f.prosecdef===false));
    });
    await t.test('anon e authenticated não leem tabelas nem executam RPCs administrativas',async()=>{
      for(const role of ['anon','authenticated']) {
        await db.exec(`set role ${role}`);
        for(const table of ['devices','readings','sessions','pairing_codes','rate_limits']) {
          await assert.rejects(db.query(`select * from public.racker_${table}`),/permission denied/);
        }
        await assert.rejects(db.query('select public.racker_state(false, 1000)'),/permission denied/);
        await assert.rejects(db.query("select public.racker_cleanup(1000)"),/permission denied/);
        await db.exec('reset role');
      }
      await db.exec('set role service_role');
    });
    await t.test('login persiste entre cold starts e usa cookie seguro',async()=>{
      const health=await call(a,'/health');
      assert.equal(health.status,200);
      assert.deepEqual(health.body,{ok:true,service:'racker',apiVersion:1,storage:'supabase'});
      assert.equal((await call(a,'/api/state')).status,401);
      const login=await call(a,'/api/login',{method:'POST',body:{password:env.ADMIN_PASSWORD}});
      assert.equal(login.status,200);
      assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\/; Max-Age=28800; Secure/);
      cookie=login.headers.get('set-cookie').split(';')[0];
      assert.equal((await call(b,'/api/state',{auth:true})).status,200);
      assert.equal((await call(fresh(),'/api/state',{auth:true})).body.storage,'supabase');
    });
    await t.test('alterar a senha do painel invalida cookies emitidos com a senha anterior',async()=>{
      const changed=createNetlifyHandler({env:{...env,ADMIN_PASSWORD:'outra-senha-de-teste-987654'},fetchImpl,now:()=>clock});
      assert.equal((await call(changed,'/api/state',{auth:true})).status,401);
      assert.equal((await call(a,'/api/state',{auth:true})).status,200);
    });
    await t.test('bloqueia origem externa antes de consultar o banco',async()=>{
      const before=calls;
      assert.equal((await call(a,'/api/pairing',{method:'POST',body:{},auth:true,headers:{Origin:'https://outro.example'}})).status,403);
      assert.equal(calls,before);
    });
    await t.test('pareamento exige consentimento e só pode ser consumido uma vez',async()=>{
      code=(await call(a,'/api/pairing',{method:'POST',body:{},auth:true})).body.code;
      assert.equal((await call(b,'/api/pair',{method:'POST',body:{code,name:'Meu Android',model:'Teste',consent:false}})).status,400);
      const results=await Promise.all([a,b].map(handler=>call(handler,'/api/pair',{method:'POST',body:{code,name:'Meu Android',model:'Teste',consent:true}})));
      assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);
      const result=results.find(r=>r.status===201);
      deviceToken=result.body.token;deviceId=result.body.id;
    });
    await t.test('telemetria funciona em outra instância sem expor tokens',async()=>{
      const sent=await call(fresh(),'/api/telemetry',{method:'POST',token:deviceToken,body:{battery:75,network:'wifi',androidVersion:'15'}});
      assert.equal(sent.status,200);
      const state=(await call(b,'/api/state',{auth:true})).body;
      assert.equal(state.devices[0].latest.battery,75);
      assert.ok(!JSON.stringify(state).includes(deviceToken));assert.ok(!JSON.stringify(state).includes('token_hash'));
      const saved=(await db.query('select token_hash from public.racker_devices')).rows[0];
      assert.notEqual(saved.token_hash,deviceToken);assert.match(saved.token_hash,/^[a-f0-9]{64}$/);
    });
    await t.test('exportação contém leituras além das 120 mostradas no painel',async()=>{
      await db.query(`insert into public.racker_readings(device_id,at_ms,sample)
        select $1::uuid, $2::bigint-i, jsonb_build_object('timestamp',$2::bigint-i,'battery',70,'network','wifi','location',null)
        from generate_series(1,130) as i`,[deviceId,clock]);
      assert.equal((await call(a,'/api/state',{auth:true})).body.devices[0].history.length,120);
      assert.equal((await call(b,'/api/export',{auth:true})).body.devices[0].history.length,131);
    });
    await t.test('logout em outra instância revoga a sessão existente',async()=>{
      assert.equal((await call(fresh(),'/api/logout',{method:'POST',auth:true,body:{}})).status,200);
      assert.equal((await call(a,'/api/state',{auth:true})).status,401);
      const login=await call(b,'/api/login',{method:'POST',body:{password:env.ADMIN_PASSWORD}});
      cookie=login.headers.get('set-cookie').split(';')[0];
    });
    await t.test('expiração e retenção são mantidas no banco',async()=>{
      const pairing=(await call(a,'/api/pairing',{method:'POST',auth:true,body:{}})).body;
      clock+=6*60000;
      assert.equal((await call(b,'/api/pair',{method:'POST',body:{code:pairing.code,name:'Novo',model:'Teste',consent:true}})).status,400);
      clock+=31*86400000;
      assert.equal((await call(a,'/api/state',{auth:true})).status,401);
      const login=await call(b,'/api/login',{method:'POST',body:{password:env.ADMIN_PASSWORD}});
      cookie=login.headers.get('set-cookie').split(';')[0];
      const d=(await call(a,'/api/state',{auth:true})).body.devices[0];
      assert.equal(d.latest,null);assert.equal(d.history.length,0);
      assert.equal(Number((await db.query('select count(*) from public.racker_readings')).rows[0].count),0);
    });
    await t.test('remoção revoga o aparelho entre instâncias e apaga leituras em cascata',async()=>{
      await call(a,'/api/telemetry',{method:'POST',token:deviceToken,body:{battery:70,network:'cellular'}});
      assert.equal((await call(b,'/api/devices/'+deviceId,{method:'DELETE',auth:true,body:{}})).status,200);
      assert.equal((await call(fresh(),'/api/telemetry',{method:'POST',token:deviceToken,body:{battery:69}})).status,401);
      assert.equal(Number((await db.query('select count(*) from public.racker_readings')).rows[0].count),0);
    });
    await t.test('limite de login é compartilhado e ignora X-Forwarded-For enviado pelo cliente',async()=>{
      for(let i=0;i<8;i++) {
        assert.equal((await call(i%2?a:b,'/api/login',{method:'POST',ip:'198.51.100.99',body:{password:'errada'},headers:{'X-Forwarded-For':`203.0.113.${i}`}})).status,401);
      }
      assert.equal((await call(fresh(),'/api/login',{method:'POST',ip:'198.51.100.99',body:{password:env.ADMIN_PASSWORD}})).status,429);
    });
    await t.test('migração preserva registros externos ao Racker',async()=>{
      await db.exec('reset role');
      assert.equal((await db.query('select title from public.unrelated_records')).rows[0].title,'Registro independente');
    });
  } finally { await db.close(); }
});

test('Netlify não inicia com credenciais públicas ou configuração ausente',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;throw new Error('Não deveria acessar a rede.');};
  for(const env of [{},{ADMIN_PASSWORD:'senha-123456789',SUPABASE_SECRET_KEY:'sb_publishable_not_a_secret'}]) {
    const response=await createNetlifyHandler({env,fetchImpl})(new Request('https://racker.example/health'),{ip:'127.0.0.1'});
    assert.equal(response.status,503);assert.equal((await response.json()).code,'CONFIGURATION_REQUIRED');
  }
  assert.equal(calls,0);
});

test('saúde não indica conexão bem-sucedida quando o Supabase falha',async()=>{
  const env={ADMIN_PASSWORD:'senha-cloud-de-teste-123456',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_only_for_local_tests'};
  const handler=createNetlifyHandler({env,fetchImpl:async()=>Response.json({message:'erro interno com detalhe privado'},{status:503})});
  const response=await handler(new Request('https://racker.example/health'),{ip:'127.0.0.1'});
  assert.equal(response.status,503);
  const body=await response.json();
  assert.ok(!body.ok);
  assert.ok(!JSON.stringify(body).includes('detalhe privado'));
});
