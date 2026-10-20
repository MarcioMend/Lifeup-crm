/* Life Up Pós-Vendas — módulo independente. Requer app.js e Supabase carregados. */
(() => {
  'use strict';
  const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let pedidos=[], ambientes=[], etapas=[], visitas=[], admin=false;
  const $ = s => document.querySelector(s);
  const msg = (t,erro=false) => { const el=$('#pvMensagem'); if(el){el.textContent=t;el.className=erro?'pv-erro':'pv-info';} };
  const errorText = err => err?.message || 'Erro desconhecido';
  const fmtDate = v => v ? new Date(v+'T12:00:00').toLocaleDateString('pt-BR') : 'Não definida';
  const layout = () => {
    const nav = document.querySelector('aside nav');
    const main = document.querySelector('main');
    if(!nav || !main || $('#pvNav')) return;
    const b=document.createElement('button');b.id='pvNav';b.type='button';b.textContent='▤ Pós-Vendas';b.style.display='none';nav.appendChild(b);
    const section=document.createElement('section');section.id='posvenda';section.className='view';
    section.innerHTML=`<div class="pv-header"><div><small>PRODUÇÃO • INSTALAÇÃO</small><h2>CRM Pós-Vendas</h2></div><div class="pv-actions"><button class="primary" id="pvNovoPedido">+ Novo pedido</button><button class="primary" id="pvNovoAmbiente">+ Ambiente</button><button class="primary" id="pvNovaVisita">+ Visita</button><button id="pvAtualizar" type="button">Atualizar</button></div></div><div id="pvMensagem" role="status"></div><div id="pvIndicadores" class="pv-indicadores"></div><div class="pv-toolbar"><input id="pvBusca" placeholder="Buscar pedido ou cliente" aria-label="Buscar pedido ou cliente"><span>Arraste os cartões para mudar a etapa</span></div><div id="pvBoard" class="pv-board"></div><h3>Ambientes e fabricação</h3><div id="pvAmbientes" class="pv-lista"></div><h3>Visitas e instalações</h3><div id="pvVisitas" class="pv-lista"></div>`;
    main.appendChild(section);
    b.addEventListener('click',async()=>{document.querySelectorAll('nav button,.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');section.classList.add('active');$('#title').textContent='Pós-Vendas';const novo=$('#novo');if(novo)novo.style.display='none';await carregar();});
    document.querySelectorAll('aside nav button:not(#pvNav)').forEach(btn=>btn.addEventListener('click',()=>{const novo=$('#novo');if(novo)novo.style.display='';}));
    $('#pvAtualizar').onclick=carregar;
    $('#pvBusca').oninput=render;
    $('#pvNovoPedido').onclick=novoPedido;
    $('#pvNovoAmbiente').onclick=novoAmbiente;
    $('#pvNovaVisita').onclick=novaVisita;
  };
  async function checarAcesso(){
    const {data:{user},error}=await db.auth.getUser();
    if(error||!user){admin=false;} else {
      const {data,error:pe}=await db.from('perfis').select('tipo,ativo').eq('id',user.id).maybeSingle();
      admin=!pe&&data?.tipo==='administrador'&&data?.ativo===true;
    }
    const b=$('#pvNav');if(b)b.style.display=admin?'':'none';
    if(!admin && $('#posvenda')?.classList.contains('active')) document.querySelector('[data-v="dashboard"]')?.click();
  }
  async function carregar(){
    if(!admin){msg('Acesso reservado aos administradores.',true);return;}
    msg('Carregando dados...');
    const rs=await Promise.all([
      db.from('posvenda_etapas').select('id,ordem,nome,ativo').eq('ativo',true).order('ordem'),
      db.from('posvenda_pedidos').select('id,numero_pedido,nome_cliente,etapa_atual,responsavel_posvenda,observacoes,created_at').order('created_at',{ascending:false}),
      db.from('posvenda_ambientes').select('id,pedido_id,nome_ambiente,status_ambiente,previsao_fabricacao,prazo_fabricacao_dias_uteis,aprovacao_tecnica_em'),
      db.from('posvenda_visitas').select('id,pedido_id,ambiente_id,data_visita,tipo_visita,status_visita,responsavel_visita').order('data_visita',{ascending:true})
    ]);
    const falhas=rs.map((r,i)=>r.error?['etapas','pedidos','ambientes','visitas'][i]+': '+errorText(r.error):null).filter(Boolean);
    [etapas,pedidos,ambientes,visitas]=rs.map(r=>r.data||[]);
    render();
    msg(falhas.length?'Falha ao consultar '+falhas.join(' | '):'Dados atualizados.',!!falhas.length);
  }
  function render(){
    const q=($('#pvBusca')?.value||'').toLowerCase();
    const filtrados=pedidos.filter(p=>(String(p.numero_pedido||'')+' '+String(p.nome_cliente||'')).toLowerCase().includes(q));
    const hoje=new Date().toISOString().slice(0,10);
    const atrasados=ambientes.filter(a=>a.previsao_fabricacao&&a.previsao_fabricacao<hoje&&!['concluido','concluído','entregue'].includes(String(a.status_ambiente||'').toLowerCase())).length;
    $('#pvIndicadores').innerHTML=`<div><small>Pedidos</small><strong>${pedidos.length}</strong></div><div><small>Ambientes</small><strong>${ambientes.length}</strong></div><div><small>Previsões vencidas*</small><strong>${atrasados}</strong></div><div><small>Visitas</small><strong>${visitas.length}</strong></div>`;
    $('#pvBoard').innerHTML=etapas.length?etapas.map(e=>{
      const cards=filtrados.filter(p=>p.etapa_atual===e.nome);
      return `<div class="pv-col" data-etapa="${E(e.nome)}"><div class="pv-col-title"><b>${E(e.nome)}</b><span>${cards.length}</span></div>${cards.map(p=>`<div class="pv-card" draggable="true" data-pedido="${p.id}" role="button" tabindex="0" title="Clique para editar o pedido"><strong>${E(p.nome_cliente||'Cliente não informado')}</strong><small>Pedido ${E(p.numero_pedido||p.id)}</small><small>${E(p.responsavel_posvenda||'Sem responsável')}</small></div>`).join('')}</div>`;
    }).join(''):'<p>Não há etapas disponíveis. Verifique as permissões de leitura de posvenda_etapas.</p>';
    document.querySelectorAll('.pv-card').forEach(el=>el.ondragstart=e=>e.dataTransfer.setData('text/plain',el.dataset.pedido));
    document.querySelectorAll('.pv-card').forEach(el=>{
      el.addEventListener('click',()=>editarPedido(Number(el.dataset.pedido)));
      el.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();editarPedido(Number(el.dataset.pedido));}});
    });
    document.querySelectorAll('.pv-col').forEach(el=>{
      el.ondragover=e=>e.preventDefault();
      el.ondrop=async e=>{e.preventDefault();const id=Number(e.dataTransfer.getData('text/plain'));const p=pedidos.find(x=>x.id===id);if(!p||p.etapa_atual===el.dataset.etapa)return;
        const antes=p.etapa_atual; p.etapa_atual=el.dataset.etapa;render();
        const {error}=await db.from('posvenda_pedidos').update({etapa_atual:el.dataset.etapa}).eq('id',id);
        if(error){p.etapa_atual=antes;render();msg('Não foi possível mover o pedido: '+errorText(error),true);}else{msg('Etapa atualizada.');await carregar();}
      };
    });
    const nomePedido=id=>{const p=pedidos.find(x=>x.id===id);return p?`${p.numero_pedido||p.id} — ${p.nome_cliente||'Cliente'}`:`Pedido ${id||'não definido'}`};
    $('#pvAmbientes').innerHTML=ambientes.length?ambientes.map(a=>`<div class="pv-item"><b>${E(a.nome_ambiente||'Ambiente sem nome')}</b><span>${E(nomePedido(a.pedido_id))}</span><span>Status: ${E(a.status_ambiente||'Não informado')}</span><span>Previsão: ${E(fmtDate(a.previsao_fabricacao))}</span></div>`).join(''):'<p>Nenhum ambiente cadastrado.</p>';
    $('#pvVisitas').innerHTML=visitas.length?visitas.map(v=>`<div class="pv-item"><b>${E(v.tipo_visita||'Visita')}</b><span>${E(nomePedido(v.pedido_id))}</span><span>${v.data_visita?new Date(v.data_visita).toLocaleString('pt-BR'):'Sem data'}</span><span>${E(v.status_visita||'Sem status')}</span></div>`).join(''):'<p>Nenhuma visita cadastrada.</p>';
  }
  async function novoPedido(){
    const nome=prompt('Nome do cliente:');if(!nome?.trim())return;
    const numero=prompt('Número do pedido (opcional):')||null;
    const etapa=etapas[0]?.nome||null;
    const {error}=await db.from('posvenda_pedidos').insert({nome_cliente:nome.trim(),numero_pedido:numero,etapa_atual:etapa});
    if(error)msg('Não foi possível cadastrar: '+errorText(error),true);else await carregar();
  }
  async function novoAmbiente(){
    if(!pedidos.length){msg('Cadastre um pedido primeiro.',true);return;}
    const lista=pedidos.map(p=>`${p.id}: ${p.numero_pedido||'Sem número'} — ${p.nome_cliente||'Cliente'}`).join('\n');
    const id=Number(prompt('Informe o ID do pedido:\n'+lista));if(!pedidos.some(p=>p.id===id))return;
    const nome=prompt('Nome do ambiente (ex.: Cozinha):');if(!nome?.trim())return;
    const {error}=await db.from('posvenda_ambientes').insert({pedido_id:id,nome_ambiente:nome.trim()});
    if(error)msg('Não foi possível cadastrar ambiente: '+errorText(error),true);else await carregar();
  }
  async function novaVisita(){
    if(!pedidos.length){msg('Cadastre um pedido primeiro.',true);return;}
    const lista=pedidos.map(p=>`${p.id}: ${p.numero_pedido||'Sem número'} — ${p.nome_cliente||'Cliente'}`).join('\n');
    const id=Number(prompt('ID do pedido:\n'+lista));if(!pedidos.some(p=>p.id===id))return;
    const data=prompt('Data e hora da visita (AAAA-MM-DD HH:MM):');if(!data||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(data)){msg('Informe a data no formato solicitado.',true);return;}
    const tipo=prompt('Tipo de visita (ex.: Medição ou Instalação):')||null;
    const {error}=await db.from('posvenda_visitas').insert({pedido_id:id,data_visita:new Date(data.replace(' ','T')).toISOString(),tipo_visita:tipo});
    if(error)msg('Não foi possível agendar: '+errorText(error),true);else await carregar();
  }

  function editarPedido(id){
    if(!admin)return;
    const pedido=pedidos.find(p=>p.id===id);
    if(!pedido){msg('Pedido não encontrado.',true);return;}
    let dlg=$('#pvEditarPedidoDialog');
    if(!dlg){
      dlg=document.createElement('dialog');
      dlg.id='pvEditarPedidoDialog';
      dlg.style.cssText='border:1px solid #ddd;border-radius:12px;padding:24px;max-width:540px;width:calc(100% - 32px);box-shadow:0 12px 48px #0003;';
      dlg.innerHTML=`<form id="pvEditarPedidoForm">
        <h2 style="margin:0 0 16px">Editar pedido</h2>
        <div style="display:grid;gap:12px">
          <label>Nome do cliente<input name="nome_cliente" required style="width:100%;padding:9px;box-sizing:border-box"></label>
          <label>Número do pedido<input name="numero_pedido" style="width:100%;padding:9px;box-sizing:border-box"></label>
          <label>Responsável pelo pós-vendas<input name="responsavel_posvenda" style="width:100%;padding:9px;box-sizing:border-box"></label>
          <label>Etapa<select name="etapa_atual" style="width:100%;padding:9px;box-sizing:border-box"></select></label>
          <label>Observações<textarea name="observacoes" rows="4" style="width:100%;padding:9px;box-sizing:border-box"></textarea></label>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
          <button type="button" id="pvCancelarEdicao">Cancelar</button>
          <button class="primary" type="submit" id="pvSalvarEdicao">Salvar alterações</button>
        </div></form>`;
      document.body.appendChild(dlg);
      $('#pvCancelarEdicao').onclick=()=>dlg.close();
      dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close();});
    }
    const form=$('#pvEditarPedidoForm');
    form.elements.nome_cliente.value=pedido.nome_cliente||'';
    form.elements.numero_pedido.value=pedido.numero_pedido||'';
    form.elements.responsavel_posvenda.value=pedido.responsavel_posvenda||'';
    form.elements.observacoes.value=pedido.observacoes||'';
    const sel=form.elements.etapa_atual;
    sel.innerHTML=etapas.map(e=>`<option value="${E(e.nome)}">${E(e.nome)}</option>`).join('');
    sel.value=pedido.etapa_atual||etapas[0]?.nome||'';
    form.onsubmit=async ev=>{
      ev.preventDefault();
      const btn=$('#pvSalvarEdicao');
      const payload={
        nome_cliente:form.elements.nome_cliente.value.trim(),
        numero_pedido:form.elements.numero_pedido.value.trim()||null,
        responsavel_posvenda:form.elements.responsavel_posvenda.value.trim()||null,
        etapa_atual:sel.value||null,
        observacoes:form.elements.observacoes.value.trim()||null
      };
      if(!payload.nome_cliente){msg('Informe o nome do cliente.',true);return;}
      btn.disabled=true;btn.textContent='Salvando...';
      try{
        const {error}=await db.from('posvenda_pedidos').update(payload).eq('id',id);
        if(error)throw error;
        dlg.close();
        await carregar();
        msg('Pedido atualizado com sucesso.');
      }catch(err){msg('Erro ao editar pedido: '+errorText(err),true);alert('Não foi possível salvar: '+errorText(err));}
      finally{btn.disabled=false;btn.textContent='Salvar alterações';}
    };
    dlg.showModal();
  }
  document.addEventListener('DOMContentLoaded',()=>{
    layout();
    db.auth.onAuthStateChange((event)=>{if(['SIGNED_IN','INITIAL_SESSION','SIGNED_OUT'].includes(event))setTimeout(checarAcesso,0);});
    checarAcesso();
  });
})();
