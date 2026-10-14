/* Life Up Pós-Venda: leitura apenas, sem modificar dados */
(()=>{
const etapas=["Contrato recebido","Conferência de medidas","Caderno técnico","Aprovação técnica","Programação de produção","Em fabricação","Conferência de qualidade","Programação de entrega","Entrega dos móveis","Montagem e finalização","Assistência técnica"];
let pedidos=[],ambientes=[],carregado=false;
const el=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=v=>v?new Date(v+"T12:00:00").toLocaleDateString("pt-BR"):"Aguardando aprovação";
function aviso(m,tipo="info"){const n=el("pvStatus");n.textContent=m;n.dataset.tipo=tipo;}
function desenhar(){
 const q=(el("pvSearch")?.value||"").toLocaleLowerCase("pt-BR");
 const lista=pedidos.filter(p=>([p.nome_cliente,p.numero_pedido,p.responsavel_posvenda].join(" ").toLocaleLowerCase("pt-BR")).includes(q));
 el("posvendaBoard").innerHTML=etapas.map((nome,i)=>{const itens=lista.filter(p=>p.etapa_atual===nome);return '<div class="pv-column"><div class="pv-column-head"><span>'+(i+1)+'. '+esc(nome)+'</span><b>'+itens.length+'</b></div>'+ (itens.length?itens.map(p=>{const aa=ambientes.filter(a=>a.pedido_id===p.id);const atraso=aa.some(a=>a.previsao_fabricacao&&a.previsao_fabricacao<new Date().toLocaleDateString("en-CA")&&a.status_ambiente!=="Concluído");return '<div class="pv-card '+(atraso?'pv-late':'')+'"><strong>'+esc(p.nome_cliente||"Cliente não informado")+'</strong><small>Pedido '+esc(p.numero_pedido||p.id)+'</small><small>'+aa.length+' ambiente(s)</small><details><summary>Ver ambientes e prazos</summary>'+(aa.length?aa.map(a=>'<p><b>'+esc(a.nome_ambiente||"Ambiente")+'</b><br>Previsão: '+esc(date(a.previsao_fabricacao))+'</p>').join(""):'<p>Ambientes ainda não cadastrados.</p>')+'</details></div>'}).join(""):'<p class="pv-empty">'+(carregado?'Nenhum pedido nesta etapa':'Aguardando dados')+'</p>')+'</div>'}).join("");
 el("pvTotal").textContent=carregado?pedidos.length:"—";
 el("pvAmbientes").textContent=carregado?ambientes.filter(a=>a.aprovacao_tecnica_em&&a.status_ambiente!=="Concluído").length:"—";
 el("pvAtrasos").textContent=carregado?ambientes.filter(a=>a.previsao_fabricacao&&a.previsao_fabricacao<new Date().toLocaleDateString("en-CA")&&a.status_ambiente!=="Concluído").length:"—";
}
async function carregar(){
 aviso("Consultando acesso autorizado ao Pós-Venda…");
 if(typeof db==="undefined"){aviso("Conexão com Supabase indisponível.","erro");return}
 const {data:{user},error:authError}=await db.auth.getUser();
 if(authError||!user){carregado=false;pedidos=[];ambientes=[];desenhar();aviso("Entre com sua conta para consultar o Pós-Venda.","erro");return}
 const [rp,ra]=await Promise.all([db.from("posvenda_pedidos").select("id,numero_pedido,nome_cliente,etapa_atual,responsavel_posvenda").limit(500),db.from("posvenda_ambientes").select("id,pedido_id,nome_ambiente,aprovacao_tecnica_em,previsao_fabricacao,status_ambiente").limit(1000)]);
 if(rp.error||ra.error){pedidos=[];ambientes=[];carregado=false;desenhar();aviso("Acesso aos dados ainda não habilitado. As tabelas Pós-Venda estão protegidas; nenhuma permissão será contornada. Código: "+(rp.error?.code||ra.error?.code||"indisponível"),"erro");return}
 pedidos=rp.data||[];ambientes=ra.data||[];carregado=true;desenhar();aviso("Consulta somente leitura. Movimentações e aprovações permanecem desativadas.","sucesso");
}
document.addEventListener("DOMContentLoaded",()=>{
 const nav=el("navPosvenda");if(!nav)return;
 nav.addEventListener("click",()=>{document.querySelectorAll("nav button,.view").forEach(x=>x.classList.remove("active"));nav.classList.add("active");el("posvenda").classList.add("active");el("title").textContent="Pós-Venda";document.querySelector("main header small").textContent="GESTÃO DE PEDIDOS E PRODUÇÃO";el("novo").style.display="none";carregar();});
 document.querySelectorAll('nav button:not(#navPosvenda)').forEach(b=>b.addEventListener("click",()=>{el("novo").style.display="";document.querySelector("main header small").textContent="GESTÃO COMERCIAL";}));
 el("pvSearch")?.addEventListener("input",desenhar);
 el("pvReload")?.addEventListener("click",carregar);
 desenhar();
});
})();