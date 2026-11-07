import {existsSync, readFileSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createSupabaseStore} from '../lib/supabase-store.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(existsSync(path.join(root,'.env')))loadEnvFile(path.join(root,'.env'));
const deployment=JSON.parse(readFileSync(path.join(root,'config/deployment.json'),'utf8'));
let pending=0;
function report(ok,label,detail) {
  console.log(`[${ok?'OK':'PENDENTE'}] ${label}: ${detail}`);
  if(!ok)pending++;
}
async function apiHealth(label,origin) {
  try {
    const response=await fetch(new URL('/health',origin),{signal:AbortSignal.timeout(12000),redirect:'error'});
    if(!response.headers.get('content-type')?.includes('application/json')) {
      report(false,label,`HTTP ${response.status}; este endereço ainda não está entregando a API Racker.`);return;
    }
    const body=await response.json();
    const ok=response.ok&&body.ok===true&&body.service==='racker'&&body.apiVersion===1;
    report(ok,label,ok?`API Racker pronta; armazenamento ${body.storage}.`:`HTTP ${response.status}; verifique publicação, migração e variáveis do servidor.`);
  } catch { report(false,label,'Não foi possível alcançar a API. Confira o endereço e se o servidor está iniciado.'); }
}
await Promise.all([
  apiHealth('Servidor local',`http://127.0.0.1:${process.env.PORT||3000}`),
  apiHealth('Servidor Netlify',deployment.siteUrl)
]);
const supabaseUrl=process.env.SUPABASE_URL||deployment.supabaseUrl;
let parsed;
try { parsed=new URL(supabaseUrl); } catch { report(false,'URL Supabase','Configure uma Project URL válida.'); }
if(parsed) {
  try {
    const response=await fetch(new URL('/rest/v1/',parsed.origin),{signal:AbortSignal.timeout(10000),redirect:'error'});
    report(response.status===401||response.ok,'Endereço Supabase',`HTTP ${response.status}. A disponibilidade das tabelas será verificada com a chave do servidor.`);
  } catch(error) {
    report(false,'Endereço Supabase',error.cause?.code==='ENOTFOUND'?'Domínio não encontrado no DNS. Confira a Project URL atual no painel Supabase.':'Não foi possível alcançar o endereço configurado.');
  }
}
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key)report(false,'Credencial Supabase','Configure SUPABASE_SECRET_KEY no ambiente privado do servidor. Não coloque a chave no app ou no Git.');
else if(parsed) {
  try {
    const store=createSupabaseStore({url:supabaseUrl,secretKey:key});
    await store.hasSession('0'.repeat(64),Date.now());
    report(true,'Banco Racker','Chave aceita e RPC da migração acessível. Nenhuma leitura do celular foi enviada.');
  } catch { report(false,'Banco Racker','Confira a chave do servidor e aplique supabase/migrations/202611060001_racker.sql.'); }
}
console.log(pending?`${pending} pendência(s). O sincronismo online ainda não está validado.`:'API e banco responderam às verificações. Falta validar um envio no aparelho.');
if(pending)process.exitCode=1;
