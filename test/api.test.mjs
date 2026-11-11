import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRacker} from '../server.mjs';

test('fluxo de autenticação, pareamento, coleta e revogação', async t => {
  const dir = mkdtempSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '.racker-test-'));
  let clock = Date.now();
  const password = 'senha-de-teste-123456';
  let handler = createRacker({password, dataDirectory: dir, now: () => clock});
  const server = http.createServer((req,res) => handler(req,res));
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie, code, deviceToken, deviceId;
  const request = async (route, {method='GET',body,auth=false,token,origin}={}) => {
    const headers = {};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(auth&&cookie)headers.Cookie=cookie;
    if(token)headers.Authorization='Bearer '+token;
    if(origin)headers.Origin=origin;
    const res=await fetch(base+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    return {status:res.status,body:await res.json(),headers:res.headers};
  };
  try {
    await t.test('saúde identifica a API e o armazenamento usados pelo Android',async()=>{
      const result=await request('/health');
      assert.equal(result.status,200);
      assert.deepEqual(result.body,{ok:true,service:'racker',apiVersion:1,storage:'local'});
    });
    await t.test('protege dados e bloqueia origem externa',async()=>{
      assert.equal((await request('/api/state')).status,401);
      assert.equal((await request('/api/login',{method:'POST',body:{password},origin:'https://outro.example'})).status,403);
      assert.equal((await request('/api/login',{method:'POST',body:{password:'errada'}})).status,401);
      const login=await request('/api/login',{method:'POST',body:{password}});
      assert.equal(login.status,200);
      assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
      cookie=login.headers.get('set-cookie').split(';')[0];
      assert.deepEqual((await request('/api/state',{auth:true})).body.devices,[]);
    });
    await t.test('pareamento exige consentimento e código de uso único',async()=>{
      const result=await request('/api/pairing',{method:'POST',auth:true,body:{}});
      code=result.body.code;
      assert.match(code,/^\d{8}$/);
      assert.equal((await request('/api/pair',{method:'POST',body:{code,name:'Meu Android',model:'Modelo',consent:false}})).status,400);
      const pair=await request('/api/pair',{method:'POST',body:{code,name:'Meu Android',model:'Modelo',consent:true}});
      assert.equal(pair.status,201);deviceToken=pair.body.token;deviceId=pair.body.id;
      assert.equal((await request('/api/pair',{method:'POST',body:{code,name:'Outro',model:'Modelo',consent:true}})).status,400);
      const file=readFileSync(path.join(dir,'devices.json'),'utf8');
      assert.ok(!file.includes(deviceToken));assert.ok(file.includes('tokenHash'));
    });
    await t.test('valida a telemetria e mantém campos privados fora do painel',async()=>{
      assert.equal((await request('/api/telemetry',{method:'POST',body:{battery:80}})).status,401);
      const result=await request('/api/telemetry',{method:'POST',token:deviceToken,body:{battery:72,charging:true,network:'wifi',androidVersion:'15',location:{latitude:-23.55,longitude:-46.63,accuracy:25,capturedAt:clock},extraSecret:'ignorar'}});
      assert.equal(result.status,200);
      const state=(await request('/api/state',{auth:true})).body;
      assert.equal(state.devices[0].latest.battery,72);assert.equal(state.devices[0].latest.location.latitude,-23.55);
      assert.ok(!JSON.stringify(state).includes('tokenHash'));assert.ok(!JSON.stringify(state).includes(deviceToken));assert.ok(!JSON.stringify(state).includes('extraSecret'));
      await request('/api/telemetry',{method:'POST',token:deviceToken,body:{battery:1000,network:'inventada',location:{latitude:999,longitude:0}}});
      const safe=(await request('/api/state',{auth:true})).body.devices[0].latest;
      assert.equal(safe.battery,null);assert.equal(safe.location,null);assert.equal(safe.network,'other');
    });
    await t.test('exporta dados e persiste vínculo entre reinícios',async()=>{
      const exported=await request('/api/export',{auth:true});assert.equal(exported.status,200);assert.equal(exported.body.devices[0].history.length,2);
      handler=createRacker({password,dataDirectory:dir,now:()=>clock});
      assert.equal((await request('/api/state',{auth:true})).status,401);
      assert.equal((await request('/api/telemetry',{method:'POST',token:deviceToken,body:{battery:71,network:'cellular'}})).status,200);
      const login=await request('/api/login',{method:'POST',body:{password}});cookie=login.headers.get('set-cookie').split(';')[0];
      assert.equal((await request('/api/state',{auth:true})).body.devices[0].history.length,3);
    });
    await t.test('expira códigos, sessões e leituras antigas',async()=>{
      const pairing=await request('/api/pairing',{method:'POST',auth:true,body:{}});
      clock+=6*60000;
      assert.equal((await request('/api/pair',{method:'POST',body:{code:pairing.body.code,name:'Android',model:'Modelo',consent:true}})).status,400);
      clock+=31*86400000;
      assert.equal((await request('/api/state',{auth:true})).status,401);
      const login=await request('/api/login',{method:'POST',body:{password}});cookie=login.headers.get('set-cookie').split(';')[0];
      const state=(await request('/api/state',{auth:true})).body;
      assert.equal(state.devices[0].history.length,0);assert.equal(state.devices[0].latest,null);
      assert.equal(JSON.parse(readFileSync(path.join(dir,'devices.json'),'utf8')).devices[0].history.length,0);
    });
    await t.test('remoção apaga histórico e invalida token anterior',async()=>{
      assert.equal((await request('/api/devices/'+deviceId,{method:'DELETE',body:{},auth:true})).status,200);
      assert.equal((await request('/api/telemetry',{method:'POST',token:deviceToken,body:{battery:70}})).status,401);
      assert.deepEqual((await request('/api/state',{auth:true})).body.devices,[]);
      await request('/api/logout',{method:'POST',body:{},auth:true});
      assert.equal((await request('/api/state',{auth:true})).status,401);
    });
    await t.test('limita tentativas de login',async()=>{
      for(let i=0;i<8;i++)await request('/api/login',{method:'POST',body:{password:'errada'}});
      assert.equal((await request('/api/login',{method:'POST',body:{password}})).status,429);
    });
  } finally {
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});
  }
});
