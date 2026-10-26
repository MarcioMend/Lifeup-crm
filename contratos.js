/* Life Up Contratos — protótipo seguro de pré-visualização, SEM ENVIO ou gravação.
 * Dependências: app.js (db e esc), sessão Supabase; não usa service_role no browser.
 * A integração de envio depende de Edge Function autenticada e schema homologado.
 */
(() => {
  "use strict";
  const e = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", {style:"currency",currency:"BRL"});
  let records = [];
  const brl = value => {const raw=String(value??"").trim();return Number(raw.replace(/\./g,"").replace(",","."));};
  function render() {
    const nav = document.querySelector("aside nav"), main = document.querySelector("main");
    if (!nav || !main || document.querySelector("#contratosNav")) return;
    const b = document.createElement("button");
    b.id="contratosNav"; b.type="button"; b.textContent="▤ Contratos";
    nav.appendChild(b);
    const s=document.createElement("section");s.id="contratos";s.className="view";
    s.innerHTML='<div style="max-width:920px;margin:auto"><h2>Contratos · Pré-visualização</h2><p>Rascunho de homologação: não cria pedidos, não gera números e não envia documentos ao Autentique.</p><div id="contratosAviso" role="status"></div><label>Lead comercial <select id="contratosLead"><option value="">Selecione</option></select></label><div id="contratosResumo" style="margin-top:18px"></div><div id="contratosConferencia" hidden style="margin-top:18px;border:1px solid #d6c58d;border-radius:10px;padding:18px"><h3>Conferência do orçamento aprovado</h3><p>Preenchimento local de homologação. Nada será salvo ou enviado.</p><label>Valor aprovado (R$) <input id="contratosValorAprovado" inputmode="decimal" placeholder="0,00"></label><label>Condição de pagamento <select id="contratosPagamento"><option value="">Selecione</option><option value="10 parcelas">10 parcelas</option><option value="50% + 10 parcelas">50% + 10 parcelas</option><option value="50% + 25% + 25%">50% + 25% + 25%</option><option value="Outra condição">Outra condição — conferir no orçamento</option></select></label><label>Referência do orçamento aprovado <input id="contratosReferencia" placeholder="Identificação ou versão do orçamento"></label><button id="contratosValidar" type="button">Validar prévia</button><div id="contratosValidacao" role="status"></div></div></div>';
    main.appendChild(s);
    b.onclick=async()=>{
      document.querySelectorAll("nav button,.view").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");s.classList.add("active");
      const title=document.querySelector("#title");if(title)title.textContent="Contratos";
      const novo=document.querySelector("#novo");if(novo)novo.style.display="none";
      const aviso=s.querySelector("#contratosAviso"), sel=s.querySelector("#contratosLead");
      aviso.textContent="Carregando leads autorizados...";sel.innerHTML='<option value="">Selecione</option>';
      const {data,error}=await db.from("leads").select("id,nome,projeto,valor_estimado,etapa").order("nome",{ascending:true}).limit(250);
      if(error){aviso.textContent="Não foi possível consultar leads: "+error.message;return;}
      records=data||[];aviso.textContent="Prévia não vinculante. Valores e condições devem ser conferidos com o orçamento aprovado.";
      for(const l of records){const op=document.createElement("option");op.value=String(l.id);op.textContent=l.nome+" · "+(l.projeto||"Sem ambiente");sel.appendChild(op);}
      s.querySelector("#contratosResumo").textContent="";s.querySelector("#contratosConferencia").hidden=true;
    };
    s.querySelector("#contratosValidar").onclick=()=>{const l=records.find(x=>String(x.id)===s.querySelector("#contratosLead").value);const valor=brl(s.querySelector("#contratosValorAprovado").value);const cond=s.querySelector("#contratosPagamento").value;const ref=s.querySelector("#contratosReferencia").value.trim();const out=s.querySelector("#contratosValidacao");if(!l||!Number.isFinite(valor)||valor<=0||!cond||!ref){out.textContent="Informe lead, valor aprovado positivo, condição e referência do orçamento.";return;}out.textContent="Prévia validada localmente: "+money(valor)+" · "+cond+" · orçamento "+ref+". A emissão permanece bloqueada até comprovação do orçamento aprovado e homologação do backend.";};
    s.querySelector("#contratosLead").onchange=(ev)=>{
      const l=records.find(x=>String(x.id)===ev.target.value);
      s.querySelector("#contratosConferencia").hidden=!l;
      s.querySelector("#contratosValorAprovado").value="";s.querySelector("#contratosPagamento").value="";s.querySelector("#contratosReferencia").value="";s.querySelector("#contratosValidacao").textContent="";
      s.querySelector("#contratosResumo").innerHTML=l?
        '<div style="border:1px solid #d6c58d;border-radius:10px;padding:18px"><h3>Dados para conferência</h3><p><b>Cliente:</b> '+e(l.nome)+'</p><p><b>Ambiente:</b> '+e(l.projeto||"Não informado")+'</p><p><b>Valor estimado do lead:</b> '+money(l.valor_estimado)+'</p><p><b>Etapa comercial:</b> '+e(l.etapa)+'</p><p><b>Contrato:</b> não gerado · <b>Pedido:</b> não criado</p><p>Próxima fase: vincular orçamento aprovado, condições comerciais, anexos e dados jurídicos; só então habilitar emissão.</p></div>':"";
    };
  }
  document.addEventListener("DOMContentLoaded",render);
})();
