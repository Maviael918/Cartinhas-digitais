const $ = s => document.querySelector(s);
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4M10 5h4"/>',
  activity: '<path d="M2 12h4l3-8 6 16 3-8h4"/>',
  shield: '<path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z"/><path d="m8 12 3 3 5-6"/>',
  battery: '<rect x="2" y="6" width="18" height="12" rx="3"/><path d="M23 10v4M6 10v4M10 10v4M14 10v4"/>',
  wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r=".5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  refresh: '<path d="M21 4v6h-6M3 20v-6h6M4 9a8 8 0 0 1 13-5l4 6M3 14l4 6a8 8 0 0 0 13-5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  logout: '<path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.phone}</svg>`;
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let demo = document.body.dataset.demo === 'true', authenticated = false, view = 'overview', selected = null, devices = [], refreshing = false;
let lastRefresh = null, storageKind = 'local';
let pendingPairing = null, lastPollAttempt = 0;
const network = {wifi:'Wi-Fi',cellular:'Rede móvel',ethernet:'Ethernet',other:'Outra rede',offline:'Sem conexão'};
const time = t => t ? new Date(t).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) : '—';
const dateTime = t => t ? new Date(t).toLocaleString('pt-BR', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
const age = t => !t ? 'Sem envio' : Date.now()-t < 90000 ? 'Agora há pouco' : Date.now()-t < 3600000 ? `Há ${Math.floor((Date.now()-t)/60000)} min` : `Há ${Math.floor((Date.now()-t)/3600000)} h`;
const online = d => d?.lastSeen && Date.now() - d.lastSeen < 20 * 60000;
const button = (label, action, name, cls='') => `<button class="btn ${cls}" data-action="${action}">${name ? icon(name) : ''}${label}</button>`;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4000); }
function sampleDevices() {
  const start = Date.now();
  const history = Array.from({length:33},(_,i)=>({timestamp:start-(32-i)*900000,battery:Math.round(96-i*.72),charging:false,network:'wifi',androidVersion:'15',location:i===32?{latitude:-23.5505,longitude:-46.6333,accuracy:25,capturedAt:start}:null}));
  return [{id:'demo-android',name:'Meu Android',model:'Samsung Galaxy S24',pairedAt:start-86400000*3,lastSeen:start,history,latest:history.at(-1)}];
}
async function api(route, method='GET', body) {
  let response;
  try { response = await fetch(route,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined}); }
  catch { throw new Error('Não foi possível conectar ao servidor Racker. Confira se ele está iniciado e se este é o endereço correto.'); }
  if(!response.headers.get('content-type')?.includes('application/json')) throw new Error('Este endereço não está servindo a API Racker. O Live Server e o arquivo index.html não substituem o servidor do painel.');
  const value = await response.json();
  if (!response.ok) { if(response.status===401 && route!=='/api/login'){authenticated=false;renderLogin();} const error=new Error(value.error || 'Não foi possível concluir.');error.status=response.status;error.code=value.code;error.fields=Array.isArray(value.fields)?value.fields:[];throw error; }
  return value;
}
function renderSetupRequired(fields) {
  const descriptions={ADMIN_PASSWORD:'A senha que você vai digitar para entrar no painel Racker, com 12 a 256 caracteres.',SUPABASE_URL:'A Project URL do seu projeto Supabase.',SUPABASE_SECRET_KEY:'A chave secreta do projeto Supabase, disponível somente para o servidor.'};
  const required=[...new Set(fields)].filter(name=>typeof name==='string'&&Object.hasOwn(descriptions,name));
  $('#app').innerHTML=`<main class="startup"><a class="brand" href="/">${icon('activity')}racker<span>.</span></a><h1>Falta conectar o painel ao Supabase.</h1><p>Executar o SQL prepara o banco. Agora configure o acesso do servidor para entrar no painel e receber os envios do Android.</p>${required.length?`<h2>Configurações pendentes</h2><dl class="setup-fields">${required.map(name=>`<div><dt>${escape(name)}</dt><dd>${descriptions[name]}</dd></div>`).join('')}</dl>`:''}<ol class="steps"><li>No Netlify, abra o projeto e entre em <strong>Project configuration → Environment variables</strong>.</li><li>Configure os campos acima para <strong>Functions</strong> no ambiente de produção. Escolha uma senha própria para o painel.</li><li>Faça um novo deploy e volte aqui para verificar.</li></ol><div class="info-box">A chave secreta fica no ambiente privado do servidor. Ela não deve ser colocada no HTML, no aplicativo Android ou no Git.</div><div class="setup-actions"><a class="btn" href="https://app.netlify.com/" target="_blank" rel="noopener noreferrer">Abrir Netlify ${icon('arrow')}</a><button class="btn primary" data-action="retry">Já configurei, verificar ${icon('refresh')}</button></div></main>`;
}
function renderConnectionError(message) {
  const local = location.protocol==='file:' || ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  if(!local) {
    $('#app').innerHTML=`<main class="startup"><a class="brand" href="/">${icon('activity')}racker<span>.</span></a><h1>Não foi possível abrir seu painel.</h1><p>O serviço está indisponível no momento. Tente novamente ou peça ao responsável pela instalação para verificar o servidor.</p><button class="btn primary" data-action="retry">Tentar novamente ${icon('refresh')}</button><button class="text-button" data-action="demo">Explorar demonstração ${icon('arrow')}</button></main>`;
    return;
  }
  $('#app').innerHTML=`<main class="startup"><a class="brand" href="http://127.0.0.1:3000/">${icon('activity')}racker<span>.</span></a><h1>Abra o painel pelo servidor.</h1><p>${escape(message)}</p><p>No computador do projeto, use o endereço abaixo. Para iniciar ou reabrir, execute <strong>ABRIR-PAINEL.cmd</strong> na pasta do projeto.</p><a class="btn primary" href="http://127.0.0.1:3000/">Abrir painel no computador ${icon('arrow')}</a><div class="info-box">No celular, 127.0.0.1 aponta para o próprio telefone. Para acessar por ele, o servidor precisa estar acessível na rede e você deve usar o endereço do computador.</div><button class="text-button" data-action="demo">Explorar somente a demonstração ${icon('arrow')}</button></main>`;
}
function renderLogin() {
  pendingPairing=null;if($('#modal').open)$('#modal').close();
  $('#app').innerHTML = `<main class="login"><section class="login-story"><a class="brand" href="/">${icon('activity')}racker<span>.</span></a><div><span class="eyebrow">SEU ANDROID, POR PERTO</span><h1>Mais visibilidade.<br>Você no controle.</h1><p>Bateria, conexão e localização compartilhada em um lugar só.</p><div class="login-illustration">${icon('phone')}<span>${icon('shield')} Compartilhamento autorizado</span></div></div><small>Feito para acompanhar o seu próprio aparelho.</small></section><section class="login-form"><div class="form-inner"><span class="form-symbol">${icon('lock')}</span><h2>Seu painel começa aqui.</h2><p>Entre com a senha configurada no servidor Racker.</p><form id="login-form"><label for="password">Senha do painel</label><input id="password" type="password" name="password" autocomplete="current-password" required maxlength="256" placeholder="Digite sua senha"><p class="form-error" id="login-error" role="alert"></p><button class="btn primary" type="submit">Entrar no painel ${icon('arrow')}</button></form><button class="text-button" data-action="demo">Explorar demonstração ${icon('arrow')}</button><div class="help-box">${icon('shield')}<span>Use a senha definida para esta instalação. O aplicativo Android não recebe a senha do painel.</span></div></div></section></main>`;
  $('#login-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('/api/login','POST',{password:$('#password').value});authenticated=true;await refresh();}catch(err){$('#login-error').textContent=err.message;}finally{b.disabled=false;}});
}
function chart(d) {
  const history = (d?.history || []).filter(x=>x.battery!==null).slice(-48);
  if(history.length<2) return `<div class="chart-empty">${icon('activity')}<p>O gráfico aparece após duas sincronizações.</p></div>`;
  const x = i => 42 + i*648/(history.length-1), y = b => 155-(b/100)*130;
  const points=history.map((h,i)=>`${x(i)},${y(h.battery)}`).join(' ');
  return `<svg class="battery-chart" role="img" aria-label="Histórico de bateria de ${history[0].battery} a ${history.at(-1).battery} por cento" viewBox="0 0 720 195"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b6e86c" stop-opacity=".3"/><stop offset="100%" stop-color="#b6e86c" stop-opacity="0"/></linearGradient></defs>${[0,50,100].map(b=>`<line x1="42" x2="690" y1="${y(b)}" y2="${y(b)}" stroke="#e9ece7" stroke-dasharray="4 5"/><text x="0" y="${y(b)+4}" class="chart-label">${b}%</text>`).join('')}<polygon points="42,155 ${points} 690,155" fill="url(#area)"/><polyline points="${points}" fill="none" stroke="#6b9f37" stroke-width="2.5" stroke-linejoin="round"/><circle cx="690" cy="${y(history.at(-1).battery)}" r="4" fill="#6b9f37" stroke="white" stroke-width="2"/>${[0,Math.floor(history.length/2),history.length-1].map(i=>`<text x="${x(i)}" y="185" text-anchor="${i===0?'start':i===history.length-1?'end':'middle'}" class="chart-label">${time(history[i].timestamp)}</text>`).join('')}</svg>`;
}
function mapContent(d) {
  const location = d?.latest?.location;
  if(!location) return `<div class="location-empty">${icon('pin')}<strong>Localização não compartilhada</strong><p>Ative a opção no app e envie uma atualização com o app aberto.</p></div>`;
  if(!demo) return `<div class="real-location"><div class="large-pin">${icon('pin')}</div><strong>${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}</strong><p>Enviada ${dateTime(location.capturedAt)}<br>${location.accuracy===null?'Precisão não informada':`Precisão aproximada: ${Math.round(location.accuracy)} m`}</p><a class="btn" href="https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=16/${location.latitude}/${location.longitude}" target="_blank" rel="noopener noreferrer">Abrir no mapa ${icon('arrow')}</a><small>O mapa abre em um serviço externo.</small></div>`;
  return `<div class="illustrative-map"><svg viewBox="0 0 400 260" role="img" aria-label="Mapa ilustrativo, com localização fictícia"><rect width="400" height="260" fill="#f0f2eb"/><g fill="#e4e9dc"><rect x="12" y="18" width="82" height="47" rx="6"/><rect x="110" y="10" width="92" height="55" rx="6"/><rect x="222" y="15" width="64" height="65" rx="6"/><rect x="310" y="10" width="82" height="65" rx="6"/><rect x="15" y="92" width="107" height="65" rx="6"/><rect x="16" y="182" width="95" height="64" rx="6"/><rect x="136" y="185" width="82" height="60" rx="6"/><rect x="295" y="176" width="92" height="68" rx="6"/><rect x="302" y="102" width="88" height="50" rx="6"/></g><path d="M-20 145 420 67M250-20 213 280" stroke="white" stroke-width="19"/><path d="m-20 145 440-78M250-20 213 280" stroke="#dce3d3" stroke-width="1.5"/><path d="M170 10c-20 80 35 80-8 160s-25 80-25 110" stroke="#cfddc1" stroke-width="25" fill="none"/><circle cx="239" cy="105" r="44" fill="#a4c77f" opacity=".17"/><circle cx="239" cy="105" r="27" fill="#a4c77f" opacity=".22"/><circle cx="239" cy="105" r="10" fill="#4f7735" stroke="white" stroke-width="4"/><text x="45" y="215" fill="#87977b" font-size="10" letter-spacing="2">ÁREA ILUSTRATIVA</text></svg><span class="map-label">${icon('pin')}São Paulo, SP <small>Exemplo fictício</small></span></div>`;
}
function activityRows(d, limit=5) {
  const samples=(d?.history||[]).slice(-limit).reverse();
  return samples.length ? samples.map(h=>`<div class="event"><span class="event-icon">${icon('refresh')}</span><div><strong>Atualização recebida</strong><p>Bateria ${h.battery===null?'não informada':`${h.battery}%`} · ${escape(network[h.network])}${h.location?' · Localização compartilhada':''}</p></div><time datetime="${new Date(h.timestamp).toISOString()}">${time(h.timestamp)}</time></div>`).join('') : `<div class="empty-inline">Os envios do seu Android aparecerão aqui.</div>`;
}
function overview(d) {
  const s=d?.latest;
  return `<div class="intro"><div><span class="eyebrow">UMA VISÃO DO SEU DIA</span><h1>Seu Android, por perto<span>.</span></h1><p>Acompanhe o essencial. Mantenha o controle.</p></div><div class="date-chip">${new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}</div></div>
    ${!d?`<div class="welcome-card"><div class="large-pin">${icon('phone')}</div><h2>Vamos conectar seu primeiro Android?</h2><p>Gere um código no painel e confirme o compartilhamento no app do celular.</p>${button('Conectar aparelho','pair','plus','primary')}</div>`:''}
    <section class="stats" aria-label="Indicadores do aparelho"><article class="stat"><div><span>Bateria</span>${icon('battery')}</div><strong>${s?.battery!=null?s.battery+'<small>%</small>':'—'}</strong><p><span class="dot ${s?'':'muted'}"></span>${s?s.charging?'Carregando':'Usando a bateria':'Aguardando primeiro envio'}</p></article><article class="stat"><div><span>Conexão</span>${icon('wifi')}</div><strong class="text-value">${s?escape(network[s.network]):'—'}</strong><p>${s?'Rede no último envio':'Aguardando primeiro envio'}</p></article><article class="stat"><div><span>Última sincronização</span>${icon('clock')}</div><strong>${time(d?.lastSeen)}</strong><p>${age(d?.lastSeen)}${demo?' · exemplo':''}</p></article><article class="stat"><div><span>Localização</span>${icon('pin')}</div><strong class="text-value">${s?.location?'Compartilhada':'Desativada'}</strong><p>${s?.location?'No último envio do aparelho':'Você escolhe quando compartilhar'}</p></article></section>
    <div class="overview-grid"><section class="panel battery-panel"><div class="panel-heading"><div><h2>Bateria ao longo do dia</h2><p>Últimas ${Math.min(48,d?.history?.length||0)} leituras recebidas</p></div><span class="subtle-pill">${icon('battery')} Nível de carga</span></div>${chart(d)}<div class="chart-footer"><span><i></i> Bateria do aparelho</span><span>Atualização em primeiro plano ou a cada ~15 min</span></div></section><section class="panel map-panel"><div class="panel-heading"><div><h2>Localização compartilhada</h2><p>${demo?'Prévia com dados fictícios':'Somente quando autorizada no celular'}</p></div>${icon('pin')}</div>${mapContent(d)}</section><section class="panel activity-panel"><div class="panel-heading"><div><h2>Atividade recente</h2><p>Cada envio, em uma linha do tempo.</p></div><button class="text-button" data-action="activity">Ver histórico ${icon('arrow')}</button></div>${activityRows(d)}</section><section class="privacy-card"><span class="privacy-symbol">${icon('shield')}</span><span class="eyebrow">VOCÊ DECIDE</span><h2>Seu celular.<br>Seus limites.</h2><p>A coleta é visível no app. Você pode interromper os envios e remover o vínculo quando quiser.</p><button class="text-button" data-action="privacy">Gerenciar privacidade ${icon('arrow')}</button></section></div>`;
}
function devicesView(){return `<div class="intro"><div><span class="eyebrow">SEUS APARELHOS</span><h1>Dispositivos<span>.</span></h1><p>Gerencie os Androids que você autorizou.</p></div>${button('Conectar aparelho','pair','plus','primary')}</div><div class="device-grid">${devices.length?devices.map(d=>`<article class="panel device-card"><div class="device-hero">${icon('phone')}<span class="badge ${online(d)?'green':''}"><i></i>${online(d)?'Envio recente':'Aguardando envio'}</span></div><h2>${escape(d.name)}</h2><p>${escape(d.model)}</p><dl><div><dt>Android</dt><dd>${escape(d.latest?.androidVersion||'Ainda não informado')}</dd></div><div><dt>Vinculado em</dt><dd>${dateTime(d.pairedAt)}</dd></div><div><dt>Último envio</dt><dd>${dateTime(d.lastSeen)}</dd></div></dl><div class="device-actions"><button class="btn" data-select="${escape(d.id)}">Abrir painel ${icon('arrow')}</button><button class="text-button danger" data-revoke="${escape(d.id)}">Remover</button></div></article>`).join(''):`<div class="panel empty-state">${icon('phone')}<h2>Nenhum aparelho vinculado</h2><p>Conecte seu Android para começar.</p>${button('Conectar aparelho','pair','plus','primary')}</div>`}</div>`;}
function privacyView(d){return `<div class="intro"><div><span class="eyebrow">TRANSPARÊNCIA EM PRIMEIRO LUGAR</span><h1>Privacidade<span>.</span></h1><p>Entenda o que chega ao painel e controle seus dados.</p></div></div><div class="privacy-grid"><section class="panel"><div class="panel-heading"><div><h2>O que esta versão acompanha</h2><p>O compartilhamento começa depois do pareamento.</p></div>${icon('shield')}</div>${[['battery','Bateria e carregamento','Nível da bateria e indicação de carregamento.'],['wifi','Estado da conexão','Wi-Fi, rede móvel ou outra conexão.'],['phone','Informações do aparelho','Nome, modelo e versão do Android.'],['pin','Localização opcional','Enviada somente pelo botão de sincronização, com o app aberto e sua permissão.']].map(([i,t,p])=>`<div class="permission-row"><span class="event-icon">${icon(i)}</span><div><strong>${t}</strong><p>${p}</p></div>${icon('check')}</div>`).join('')}<div class="info-box">Esta versão não coleta conversas, senhas, fotos, áudio, câmera ou conteúdo de outros aplicativos.</div></section><section class="panel"><div class="panel-heading"><div><h2>Seus dados, sob seu controle</h2><p>Ações de gerenciamento</p></div></div><div class="management"><h3>Exportar histórico</h3><p>Baixe em JSON as leituras disponíveis no painel.</p>${button('Exportar meus dados','export','download')}<hr><h3>Interromper compartilhamento</h3><p>No Android, toque em “Pausar envios”. Remova o aparelho abaixo para revogar o token e apagar seu histórico no servidor.</p>${d?`<button class="btn danger" data-revoke="${escape(d.id)}">Remover ${escape(d.name)}</button>`:'<small>Nenhum aparelho vinculado.</small>'}<hr><h3>Armazenamento</h3><p>O servidor guarda até 1.000 leituras por aparelho, com janela de 30 dias. Tokens de acesso ficam armazenados como hash. ${storageKind==='supabase'?'Os registros ficam no banco Supabase e são acessados pela API do Racker.':'O arquivo de dados local não é criptografado em disco.'}</p></div></section></div>`;}
function render() {
  if(!demo&&!authenticated)return renderLogin();
  if(!selected||!devices.some(d=>d.id===selected))selected=devices[0]?.id;
  const d=devices.find(d=>d.id===selected);
  const titles={overview:'Visão geral',devices:'Dispositivos',activity:'Histórico de atividade',privacy:'Privacidade'};
  $('#app').innerHTML=`<div class="shell"><aside class="sidebar"><a class="brand" href="/">${icon('activity')}racker<span>.</span></a><span class="nav-label">ESPAÇO PESSOAL</span><nav aria-label="Navegação principal">${[['overview','grid','Visão geral'],['devices','phone','Dispositivos'],['activity','activity','Atividade'],['privacy','shield','Privacidade']].map(([v,i,t])=>`<button class="nav-item ${view===v?'active':''}" data-view="${v}" ${view===v?'aria-current="page"':''}>${icon(i)}<span>${t}</span>${v==='devices'?`<small>${devices.length}</small>`:''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="connected-card"><span class="nav-label">APARELHO SELECIONADO</span><div>${icon('phone')}<div><strong>${escape(d?.name||'Nenhum aparelho')}</strong><small>${escape(d?.model||'Conecte seu Android')}</small></div></div>${devices.length>1?`<label class="sr-only" for="device-select">Selecionar aparelho</label><select id="device-select">${devices.map(x=>`<option value="${escape(x.id)}" ${x.id===selected?'selected':''}>${escape(x.name)}</option>`).join('')}</select>`:''}<span class="status-line"><i class="dot ${online(d)?'':'muted'}"></i>${demo?'Dados de demonstração':online(d)?'Sincronização recente':'Aguardando sincronização'}</span></div><div class="account"><span class="avatar">EU</span><div><strong>Meu espaço</strong><small>${demo?'Demonstração':'Instalação pessoal'}</small></div><button class="icon-button" data-action="logout" aria-label="${demo?'Sair da demonstração':'Sair do painel'}">${icon('logout')}</button></div></div></aside><div class="workspace"><header class="topbar"><div><span class="breadcrumb">Meu espaço</span><span class="slash">/</span><strong>${titles[view]}</strong></div><div class="header-actions"><span class="badge ${demo?'demo':'green'}">${icon(demo?'activity':'lock')}${demo?'Demonstração':'Sessão autenticada'}</span><button class="icon-button" data-action="refresh" aria-label="Atualizar dados">${icon('refresh')}</button></div></header>${demo?'<div class="demo-banner"><span><strong>Modo demonstração</strong> · Todos os dados abaixo são fictícios. Nenhum celular está conectado.</span><button class="text-button" data-action="how">Como conectar meu Android '+icon('arrow')+'</button></div>':''}<main class="content">${view==='overview'?overview(d):view==='devices'?devicesView():view==='privacy'?privacyView(d):`<div class="intro"><div><span class="eyebrow">ENVIO POR ENVIO</span><h1>Histórico de atividade<span>.</span></h1><p>${escape(d?.name||'Nenhum aparelho selecionado')} · últimas ${d?.history?.length||0} leituras disponíveis</p></div>${button('Exportar dados','export','download')}</div><section class="panel history-panel">${activityRows(d,120)}</section>`}<footer><span>racker. <span class="footer-divider">/</span> Acompanhar com transparência.</span><span>${demo?'Prévia interativa':lastRefresh?'Painel consultado às '+time(lastRefresh):'Aguardando dados'} ${icon('shield')}</span></footer></main></div></div>`;
  $('#device-select')?.addEventListener('change',e=>{selected=e.target.value;render();});
}
function modal(title,body){pendingPairing=null;$('#modal-content').innerHTML=`<div class="modal-heading"><h2>${title}</h2><button class="icon-button" data-action="close" aria-label="Fechar">${icon('close')}</button></div>${body}`;if(!$('#modal').open)$('#modal').showModal();}
async function pair(){
  if(demo)return modal('Conecte seu próprio Android',`<p>Esta é uma prévia visual. Para receber dados reais:</p><ol class="steps"><li>Instale o APK atualizado no seu Android.</li><li>Entre no painel online e gere um código de pareamento.</li><li>Abra o app, informe o código e confirme o compartilhamento. O servidor já vem configurado.</li></ol><div class="info-box">O app envia bateria e rede a cada ~15 minutos. A sincronização manual é imediata. A localização é opcional e compartilhada com o app aberto.</div>${button('Entendi','close',null,'primary full-width')}`);
  await refresh();
  const knownIds=new Set(devices.map(d=>d.id));
  const result=await api('/api/pairing','POST',{});
  modal('Conectar Android',`<p>Abra o app Racker atualizado no seu Android e informe este código. O servidor já vem configurado:</p><p class="code" aria-label="Código de pareamento">${result.code.slice(0,4)} ${result.code.slice(4)}</p><p class="code-expiry">Válido até ${time(result.expires)} · uso único</p><ol class="steps"><li>No celular, informe o código e o nome do aparelho.</li><li>Autorize o compartilhamento e toque em <strong>Conectar meu Android</strong>.</li><li>O aparelho aparecerá aqui automaticamente.</li></ol><div class="info-box">Use o APK 0.3.0 ou mais recente, configurado para o painel online. Instalar o app inicia a configuração; os envios começam após sua confirmação.</div><p class="muted-text" role="status">Aguardando a confirmação no Android… Gerar outro código invalida o anterior.</p>${button('Fechar','close',null,'full-width')}`);
  pendingPairing={knownIds,expires:result.expires};
}
async function refresh(){
  if(refreshing)return;refreshing=true;lastPollAttempt=Date.now();
  try{
    if(demo){devices=devices.length?devices:sampleDevices();}else{const data=await api('/api/state');devices=data.devices;storageKind=data.storage||'local';authenticated=true;}
    const added=pendingPairing&&devices.find(d=>!pendingPairing.knownIds.has(d.id));
    if(added){pendingPairing=null;selected=added.id;view='overview';$('#modal').close();}
    lastRefresh=Date.now();render();
    if(added)toast(`${added.name} conectado ao painel.`);
  }finally{refreshing=false;}
}
function exportData(){const data={demonstration:demo,exportedAt:Date.now(),devices};const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));link.download=demo?'racker-exemplo-ficticio.json':'racker-dados.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);toast(demo?'Exemplo fictício exportado.':'Dados exportados.');}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  try{
    if(b.dataset.view){view=b.dataset.view;render();return;}
    if(b.dataset.select){selected=b.dataset.select;view='overview';render();return;}
    if(b.dataset.revoke){const d=devices.find(x=>x.id===b.dataset.revoke);modal('Remover aparelho?',`<p>O vínculo de <strong>${escape(d.name)}</strong> será revogado e suas leituras serão apagadas do servidor. Para voltar a enviar, será necessário parear novamente.</p><div class="modal-actions">${button('Cancelar','close')}<button class="btn danger-fill" data-confirm-revoke="${escape(d.id)}">Remover e apagar dados</button></div>`);return;}
    if(b.dataset.confirmRevoke){if(demo){devices=devices.filter(x=>x.id!==b.dataset.confirmRevoke);toast('Aparelho fictício removido. Atualize para reiniciar a demonstração.');}else{await api('/api/devices/'+b.dataset.confirmRevoke,'DELETE',{});devices=devices.filter(x=>x.id!==b.dataset.confirmRevoke);toast('Vínculo revogado e dados apagados.');}$('#modal').close();render();return;}
    switch(b.dataset.action){
      case 'close':$('#modal').close();break;
      case 'retry':await refresh();break;
      case 'demo':demo=true;devices=sampleDevices();render();break;
      case 'how':case 'pair':await pair();break;
      case 'activity':case 'privacy':view=b.dataset.action;render();break;
      case 'export':if(!demo){const state=await api('/api/export');devices=state.devices;}exportData();break;
      case 'refresh':if(demo)devices=sampleDevices();await refresh();toast(demo?'Demonstração reiniciada.':'Painel atualizado. O próximo envio depende do Android.');break;
      case 'logout':if(!demo)await api('/api/logout','POST',{});authenticated=false;if(document.body.dataset.demo==='true'){devices=sampleDevices();view='overview';render();toast('Você está na prévia. Nenhuma sessão real foi iniciada.');}else{demo=false;devices=[];renderLogin();}break;
    }
  }catch(err){if(err.code==='CONFIGURATION_REQUIRED')renderSetupRequired(err.fields);else toast(err.message);}
});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))$('#modal').close();});
$('#modal').addEventListener('close',()=>{pendingPairing=null;});
if(demo){devices=sampleDevices();render();}
else if(location.protocol==='file:'){renderConnectionError('Você abriu o arquivo HTML diretamente. Use o endereço do servidor para entrar e conectar seu Android.');}
else{refresh().catch(error=>{if(error.code==='CONFIGURATION_REQUIRED')renderSetupRequired(error.fields);else if(error.status!==401)renderConnectionError(error.message);});}
setInterval(()=>{
  if(!authenticated||demo||document.hidden)return;
  if(pendingPairing&&Date.now()>=pendingPairing.expires){
    modal('Código expirado',`<p>O prazo para conectar o Android terminou. Gere outro código e confirme no app.</p>${button('Gerar novo código','pair',null,'primary full-width')}`);
  }
  if(Date.now()-lastPollAttempt>=(pendingPairing?3000:15000))refresh().catch(err=>{if(err.code==='CONFIGURATION_REQUIRED')renderSetupRequired(err.fields);else toast(err.message);});
},3000);
