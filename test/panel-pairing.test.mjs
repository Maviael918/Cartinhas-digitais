import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');

async function panel() {
  let now=1_800_000_000_000, state=[], stateRequests=0;
  const nodes=new Map();
  function element() {
    const listeners=new Map();
    return {
      innerHTML:'',textContent:'',open:false,
      classList:{add(){},remove(){}},
      addEventListener(type,fn){listeners.set(type,fn);},
      showModal(){this.open=true;},
      close(){this.open=false;listeners.get('close')?.();}
    };
  }
  for(const selector of ['#app','#modal','#modal-content','#toast','#login-form'])nodes.set(selector,element());
  const document={body:{dataset:{demo:'false'}},hidden:false,querySelector:s=>nodes.get(s)||null,addEventListener(){}};
  const intervals=[];
  class Clock extends Date { static now(){return now;} }
  const context=vm.createContext({
    document,window:{},Date:Clock,location:{protocol:'https:',hostname:'cartinhas01.netlify.app'},
    setTimeout(){return 1;},clearTimeout(){},setInterval(fn){intervals.push(fn);},
    async fetch(route){
      let value;
      if(route==='/api/state'){stateRequests++;value={devices:structuredClone(state),storage:'supabase'};}
      else if(route==='/api/pairing')value={code:'12345678',expires:now+300000};
      else throw new Error('Unexpected route: '+route);
      return {ok:true,headers:{get:()=> 'application/json'},json:async()=>value};
    }
  });
  vm.runInContext(source,context);
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  await settle();
  return {
    nodes,document,
    evaluate:code=>vm.runInContext(code,context),
    setState:devices=>{state=devices;},
    requests:()=>stateRequests,
    async tick(ms){now+=ms;for(const fn of intervals)fn();await settle();}
  };
}
const phone=id=>({id,name:'Android '+id,model:'Meu celular',pairedAt:1_800_000_000_000,lastSeen:null,latest:null,history:[]});

test('painel aguarda confirmação e seleciona automaticamente apenas o novo aparelho',async()=>{
  const p=await panel();
  p.setState([phone('antigo')]);
  await p.evaluate('pair()');
  assert.equal(p.nodes.get('#modal').open,true);
  assert.match(p.nodes.get('#modal-content').innerHTML,/servidor já vem configurado/);
  await p.tick(3000);
  assert.equal(p.nodes.get('#modal').open,true,'Um vínculo existente não deve encerrar o pareamento.');
  p.setState([phone('antigo'),phone('novo')]);
  await p.tick(3000);
  assert.equal(p.nodes.get('#modal').open,false);
  assert.equal(p.evaluate('selected'),'novo');
  assert.equal(p.nodes.get('#toast').textContent,'Android novo conectado ao painel.');
  assert.match(p.nodes.get('#app').innerHTML,/Android novo/);
  const count=p.requests();
  await p.tick(3000);
  assert.equal(p.requests(),count,'Após detectar o vínculo, deve voltar ao intervalo normal.');
});

test('fechar o diálogo ou ocultar a página interrompe a consulta rápida',async()=>{
  const p=await panel();
  await p.evaluate('pair()');
  p.document.hidden=true;
  let count=p.requests();
  await p.tick(3000);
  assert.equal(p.requests(),count);
  p.document.hidden=false;
  p.nodes.get('#modal').close();
  await p.tick(3000);
  assert.equal(p.requests(),count);
  await p.tick(9000);
  assert.equal(p.requests(),count+1);
});

test('código vencido oferece outro código sem detectar um vínculo posterior',async()=>{
  const p=await panel();
  await p.evaluate('pair()');
  p.setState([phone('outro')]);
  await p.tick(300000);
  assert.equal(p.nodes.get('#modal').open,true);
  assert.match(p.nodes.get('#modal-content').innerHTML,/Código expirado/);
  assert.match(p.nodes.get('#modal-content').innerHTML,/Gerar novo código/);
  assert.equal(p.nodes.get('#toast').textContent,'');
});
