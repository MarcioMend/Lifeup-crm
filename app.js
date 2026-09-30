const SUPABASE_URL="https://fagfayywaiqagqxjjape.supabase.co";const SUPABASE_PUBLISHABLE_KEY="sb_publishable_HT0QamsnjRO6EvaWUeTFRg_AcGpAxBo";const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);async function iniciarLogin(){const login=document.querySelector("#loginScreen"),app=document.querySelector("#appShell"),form=document.querySelector("#loginForm"),err=document.querySelector("#loginError");async function mostrar(session){if(session){login.style.display="none";app.hidden=false}else{login.style.display="grid";app.hidden=true}}const {data:{session}}=await db.auth.getSession();await mostrar(session);form.onsubmit=async e=>{e.preventDefault();err.textContent="Entrando...";const {data,error}=await db.auth.signInWithPassword({email:document.querySelector("#loginEmail").value.trim(),password:document.querySelector("#loginPassword").value});if(error){err.textContent="Erro do Supabase: "+error.message;console.error("Supabase login:",error);return}err.textContent="";await mostrar(data.session)};db.auth.onAuthStateChange((_event,session)=>mostrar(session))}document.addEventListener("DOMContentLoaded",iniciarLogin);const stages=["Novo lead","Brifing de projeto e invest","Proposta 1","Visita / Medição","Projeto e proposta 2","Negociação","Stand-by","Fechamento","Perdido"];
let sellers=[],leads=[],currentSellerId=null,currentProfile=null;
const money=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});const parseBRL=v=>{let s=String(v||"").trim();if(s.includes(","))s=s.replaceAll(".","").replace(",",".");return Number(s)||0};const formatBRLInput=v=>Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function carregarCRM(){
 const [{data:vs,error:ve},{data:ls,error:le}]=await Promise.all([
  db.from("vendedores").select("id,nome,email,telefone,funcao,ativo,recebe_leads,ordem_distribuicao,user_id").order("nome"),
  db.from("leads").select("id,nome,telefone,email,projeto,valor_estimado,origem,etapa,vendedor_id,parceiro_id,observacoes,created_at,updated_at,entrou_na_etapa_em").order("created_at",{ascending:false})
 ]);
 if(ve||le){console.error(ve||le);alert("Não foi possível carregar os dados do CRM: "+(ve||le).message);return}
 const limiteStandby=new Date(Date.now()-180*24*60*60*1000).toISOString();
 const vencidos=(ls||[]).filter(l=>l.etapa==="Stand-by"&&l.updated_at&&l.updated_at<limiteStandby).map(l=>l.id);
 if(vencidos.length){const {error:ae}=await db.from("leads").update({etapa:"Arquivado"}).in("id",vencidos);if(!ae)(ls||[]).forEach(l=>{if(vencidos.includes(l.id))l.etapa="Arquivado"});else console.error("Arquivamento automático:",ae)}
 sellers=vs||[];const map=Object.fromEntries(sellers.map(s=>[s.id,s.nome]));
 leads=(ls||[]).map(l=>({...l,name:l.nome,phone:l.telefone||"",project:l.projeto||"",value:Number(l.valor_estimado||0),source:l.origem||"",stage:l.etapa,sellerId:l.vendedor_id,seller:map[l.vendedor_id]||"Sem responsável"}));
 preencherVendedores();render();
}
function preencherVendedores(){
 const a=document.querySelector("#seller"),b=document.querySelector("#seller2"),stage2=document.querySelector("#stage2");a.innerHTML='<option value="">Todos os vendedores</option>';b.innerHTML="";
 sellers.filter(s=>s.ativo).forEach(s=>{a.add(new Option(s.nome,String(s.id)));b.add(new Option(s.nome,String(s.id)))});
 if(currentSellerId&&sellers.some(s=>s.id===currentSellerId))b.value=String(currentSellerId);
 if(stage2){stage2.innerHTML=stages.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");stage2.value="Novo lead"}
}
function render(){
 const open=leads.filter(l=>!["Fechamento","Perdido","Arquivado"].includes(l.stage)),total=open.reduce((a,b)=>a+b.value,0),closed=leads.filter(l=>l.stage==="Fechamento").reduce((a,b)=>a+b.value,0);
 document.querySelector("#metrics").innerHTML=[["Leads ativos",open.length],["Leads qualificados",leads.filter(l=>l.stage==="Proposta 1").length],["Em negociação",leads.filter(l=>l.stage==="Negociação").length],["Pipeline",money(total)],["Vendas fechadas",money(closed)],["Conversão",Math.round(leads.filter(l=>l.stage==="Fechamento").length/Math.max(leads.length,1)*100)+"%"]].map(x=>'<div class="metric"><small>'+x[0]+'</small><strong>'+x[1]+'</strong><small>Dados do Supabase</small></div>').join("");
 let max=Math.max(...stages.map(s=>leads.filter(l=>l.stage===s).reduce((a,b)=>a+b.value,0)),1);
 document.querySelector("#bars").innerHTML=stages.slice(0,6).map(s=>{let v=leads.filter(l=>l.stage===s).reduce((a,b)=>a+b.value,0);return '<div class="barrow"><span>'+esc(s)+'</span><div class="track"><div class="bar" style="width:'+(v/max*100)+'%"></div></div><b>'+money(v)+'</b></div>'}).join("");
 document.querySelector("#actions").innerHTML='<div class="action"><b>Retornar leads novos</b><span>'+leads.filter(l=>l.stage==="Novo lead").length+' contato(s) aguardando atendimento</span></div><div class="action"><b>Negociações abertas</b><span>'+leads.filter(l=>l.stage==="Negociação").length+' oportunidade(s)</span></div><div class="action"><b>Banco conectado</b><span>Leads e etapas salvos no Supabase</span></div>';
 drawBoard();
 document.querySelector("#rows").innerHTML=leads.map(l=>'<tr><td><b>'+esc(l.name)+'</b></td><td>'+esc(l.phone)+'</td><td>'+esc(l.project)+'</td><td>'+esc(l.stage)+'</td><td>'+esc(l.seller)+'</td><td><b>'+money(l.value)+'</b></td></tr>').join("");
 document.querySelector("#team").innerHTML=sellers.map(s=>'<div class="person"><b>'+esc(s.nome)+'</b><span>'+esc(s.funcao||"Consultor de vendas")+'</span><span>'+esc(s.email||"Sem e-mail")+'</span><span><i class="statusdot '+(s.ativo?"active":"")+'"></i>'+(s.ativo?"Ativo":"Inativo")+'</span><span>'+leads.filter(l=>l.sellerId===s.id&&!["Fechamento","Perdido","Arquivado"].includes(l.stage)).length+' oportunidades ativas</span><div class="seller-actions"><button class="mini '+(s.recebe_leads?"on":"off")+'" data-recebe="'+s.id+'">'+(s.recebe_leads?"Recebe leads":"Pausado p/ novos leads")+'</button><button class="mini" data-ativo="'+s.id+'">'+(s.ativo?"Desativar":"Ativar")+'</button></div></div>').join("");if(!currentProfile||!["administrador","gestor"].includes(currentProfile.tipo)){document.querySelectorAll(".seller-actions").forEach(x=>x.remove())}document.querySelectorAll("[data-recebe]").forEach(b=>b.onclick=()=>alternarVendedor(Number(b.dataset.recebe),"recebe_leads"));document.querySelectorAll("[data-ativo]").forEach(b=>b.onclick=()=>alternarVendedor(Number(b.dataset.ativo),"ativo"));
}
const prazoEtapas={
 "Novo lead":{verde:2,amarelo:4},
 "Brifing de projeto e invest":{verde:24,amarelo:48},
 "Proposta 1":{verde:48,amarelo:72},
 "Visita / Medição":{verde:72,amarelo:120},
 "Projeto e proposta 2":{verde:72,amarelo:120},
 "Negociação":{verde:120,amarelo:240}
};
function statusPrazo(l){
 const p=prazoEtapas[l.stage];if(!p)return "";
 const base=l.entrou_na_etapa_em||l.created_at;if(!base)return "prazo-ok";
 const horas=(Date.now()-new Date(base).getTime())/3600000;
 return horas<=p.verde?"prazo-ok":horas<=p.amarelo?"prazo-atencao":"prazo-atrasado";
}
function drawBoard(){
 let q=(document.querySelector("#search").value||"").toLowerCase(),sf=document.querySelector("#seller").value;
 document.querySelector("#board").innerHTML=stages.map(s=>{let a=leads.filter(l=>l.stage===s&&(!sf||String(l.sellerId)===sf)&&(!q||(l.name+l.project+l.phone).toLowerCase().includes(q)));return '<div class="col" data-stage="'+esc(s)+'"><div class="colhead"><span>'+esc(s)+'</span><span class="count">'+a.length+'</span></div>'+a.map(l=>{let espera=s==="Stand-by"&&l.updated_at?Math.max(0,Math.floor((Date.now()-new Date(l.updated_at).getTime())/86400000)):null;let diasLead=Math.max(0,Math.floor((Date.now()-new Date(l.created_at).getTime())/86400000)),baseEtapa=l.entrou_na_etapa_em||l.created_at,diasEtapa=Math.max(0,Math.floor((Date.now()-new Date(baseEtapa).getTime())/86400000)),tempo=`<div class="card-age">Lead há ${diasLead} dia(s) · Nesta etapa há ${diasEtapa} dia(s)</div>`;let aviso=espera!==null?'<div class="standby-age">Em espera há '+espera+' dia(s) · arquiva em '+Math.max(0,180-espera)+' dia(s)</div>':"";return '<div class="card '+statusPrazo(l)+'" draggable="true" data-id="'+l.id+'"><h4>'+esc(l.name)+'</h4><p>'+esc(l.project)+'</p><strong>'+money(l.value)+'</strong>'+tempo+aviso+'<footer><span>'+esc(l.source)+'</span><span>'+esc((l.seller||"Sem responsável").split(" ")[0])+'</span></footer></div>'}).join("")+'</div>'}).join("");
 document.querySelectorAll(".card").forEach(c=>{c.ondragstart=e=>e.dataTransfer.setData("text",c.dataset.id);c.onclick=()=>abrirEdicaoLead(Number(c.dataset.id));c.title="Clique para abrir e editar";});
 document.querySelectorAll(".col").forEach(c=>{c.ondragover=e=>e.preventDefault();c.ondrop=async e=>{let id=Number(e.dataTransfer.getData("text")),l=leads.find(x=>x.id===id);if(!l||l.stage===c.dataset.stage)return;const old=l.stage;l.stage=c.dataset.stage;render();const {error}=await db.from("leads").update({etapa:l.stage,entrou_na_etapa_em:new Date().toISOString()}).eq("id",id);if(error){l.stage=old;render();alert("Não foi possível mover o lead: "+error.message)}}});
}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll("nav button,.view").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelector("#"+b.dataset.v).classList.add("active");document.querySelector("#title").textContent=b.textContent.trim().replace(/[▦◫◎♙]/,"").trim()});
document.querySelector("[data-go]").onclick=()=>document.querySelector('[data-v="kanban"]').click();
document.querySelector("#search").oninput=drawBoard;document.querySelector("#seller").onchange=drawBoard;
const source=document.querySelector("#source"),partnerField=document.querySelector("#partnerField"),partner=document.querySelector("#partner");
source.onchange=()=>{const show=source.value==="Parceiro indicador";partnerField.style.display=show?"block":"none";partner.required=show;if(!show)partner.value=""};
const modal=document.querySelector("#modal");document.querySelector("#novo").onclick=()=>modal.showModal();document.querySelector("#close").onclick=()=>modal.close();
document.querySelector("#form").onsubmit=async e=>{
 e.preventDefault();const btn=e.target.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent="Salvando...";
 try{
  let d=Object.fromEntries(new FormData(e.target)),partnerId=null;
  if(d.source==="Parceiro indicador"&&d.partner.trim()){let {data:p,error:pe}=await db.from("parceiros").select("id").ilike("nome",d.partner.trim()).limit(1);if(pe)throw pe;if(p&&p.length)partnerId=p[0].id;else{let {data:np,error:ne}=await db.from("parceiros").insert({nome:d.partner.trim(),ativo:true}).select("id").single();if(ne)throw ne;partnerId=np.id}}
  const payload={nome:d.name.trim(),telefone:d.phone||null,projeto:d.project||null,valor_estimado:parseBRL(d.value),origem:d.source,parceiro_id:partnerId,etapa:d.stage||"Novo lead",vendedor_id:d.seller?Number(d.seller):currentSellerId};
  const {error}=await db.from("leads").insert(payload);if(error)throw error;
  modal.close();e.target.reset();partnerField.style.display="none";partner.required=false;await carregarCRM();
 }catch(err){alert("Não foi possível salvar o lead: "+err.message)}finally{btn.disabled=false;btn.textContent="Salvar lead"}
};
async function iniciarDados(){const {data:{user}}=await db.auth.getUser();if(!user)return;const [{data:v},{data:p,error:pe}]=await Promise.all([db.from("vendedores").select("id").eq("user_id",user.id).maybeSingle(),db.from("perfis").select("tipo,ativo").eq("id",user.id).single()]);currentSellerId=v?.id||null;currentProfile=p||null;const gestor=!pe&&p?.ativo&&["administrador","gestor"].includes(p.tipo);document.querySelector("#navEquipe").style.display=gestor?"":"none";document.querySelector("#novoVendedor").style.display=gestor?"":"none";if(!gestor&&document.querySelector("#equipe").classList.contains("active"))document.querySelector('[data-v="dashboard"]').click();await carregarCRM()}
db.auth.onAuthStateChange((event,session)=>{if(session&&(event==="SIGNED_IN"||event==="INITIAL_SESSION"))setTimeout(iniciarDados,0)});

async function alternarVendedor(id,campo){const s=sellers.find(x=>x.id===id);if(!s)return;const valor=!s[campo];const {error}=await db.from("vendedores").update({[campo]:valor}).eq("id",id);if(error){alert("Não foi possível atualizar o vendedor: "+error.message);return}await carregarCRM()}
const sellerModal=document.querySelector("#sellerModal"),sellerForm=document.querySelector("#sellerForm");
document.querySelector("#novoVendedor").onclick=()=>sellerModal.showModal();
document.querySelector("#closeSeller").onclick=()=>sellerModal.close();
sellerForm.onsubmit=async e=>{e.preventDefault();const btn=e.target.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent="Salvando...";try{const d=Object.fromEntries(new FormData(e.target));const payload={nome:d.nome.trim(),email:d.email.trim()||null,telefone:d.telefone.trim()||null,funcao:d.funcao.trim()||"Consultor de vendas",ativo:true,recebe_leads:d.recebe_leads==="on"};const {error}=await db.from("vendedores").insert(payload);if(error)throw error;sellerModal.close();e.target.reset();e.target.elements.funcao.value="Consultor de vendas";await carregarCRM()}catch(err){alert("Não foi possível cadastrar o vendedor: "+err.message)}finally{btn.disabled=false;btn.textContent="Salvar vendedor"}};

document.querySelector("#logout").onclick=async()=>{const btn=document.querySelector("#logout");btn.disabled=true;btn.textContent="Saindo...";const {error}=await db.auth.signOut();if(error){alert("Não foi possível sair: "+error.message);btn.disabled=false;btn.textContent="↪ Sair";return}location.reload()};

const leadModal=document.querySelector("#leadModal"),leadForm=document.querySelector("#leadForm");
document.querySelector("#closeLead").onclick=()=>leadModal.close();
function abrirEdicaoLead(id){
 const l=leads.find(x=>x.id===id);if(!l)return;
 document.querySelector("#editLeadId").value=l.id;document.querySelector("#editName").value=l.name||"";document.querySelector("#editPhone").value=l.phone||"";document.querySelector("#editProject").value=l.project||"";document.querySelector("#editValue").value=formatBRLInput(l.value||0);document.querySelector("#editSource").value=l.source||"WhatsApp";document.querySelector("#editObs").value=l.observacoes||"";
 const es=document.querySelector("#editSeller");es.innerHTML='<option value="">Sem responsável</option>'+sellers.filter(s=>s.ativo||s.id===l.sellerId).map(s=>'<option value="'+s.id+'">'+esc(s.nome)+'</option>').join("");es.value=l.sellerId||"";
 const st=document.querySelector("#editStage");st.innerHTML=stages.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("");st.value=l.stage;
 leadModal.showModal();
}
leadForm.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target)),btn=e.target.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent="Salvando...";try{const payload={nome:d.name.trim(),telefone:d.phone||null,projeto:d.project||null,valor_estimado:parseBRL(d.value),origem:d.source,etapa:d.stage,vendedor_id:d.seller?Number(d.seller):null,observacoes:d.observacoes||null};const {error}=await db.from("leads").update(payload).eq("id",Number(d.id));if(error)throw error;leadModal.close();await carregarCRM()}catch(err){alert("Não foi possível atualizar o lead: "+err.message)}finally{btn.disabled=false;btn.textContent="Salvar alterações"}};
document.querySelector("#deleteLead").onclick=async()=>{const id=Number(document.querySelector("#editLeadId").value),l=leads.find(x=>x.id===id);if(!l)return;if(!confirm('Excluir permanentemente o lead "'+l.name+'"? Esta ação não pode ser desfeita.'))return;const {error}=await db.from("leads").delete().eq("id",id);if(error){alert("Não foi possível excluir o lead: "+error.message);return}leadModal.close();await carregarCRM()};
