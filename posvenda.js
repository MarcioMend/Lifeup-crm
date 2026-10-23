/* Life Up Pós-Vendas — módulo independente. Requer app.js e Supabase carregados. */
(() => {
  'use strict';
  const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let pedidos=[], ambientes=[], etapas=[], visitas=[], controles=[], checklists=[], admin=false;
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
    section.innerHTML=`<div class="pv-header"><div><small>PRODUÇÃO • INSTALAÇÃO</small><h2>CRM Pós-Vendas</h2></div><div class="pv-actions"><button class="primary" id="pvNovoPedido">+ Novo pedido</button><button id="pvAtualizar" type="button">Atualizar</button></div></div><div id="pvMensagem" role="status"></div><div id="pvIndicadores" class="pv-indicadores"></div><div class="pv-toolbar"><input id="pvBusca" placeholder="Buscar pedido ou cliente" aria-label="Buscar pedido ou cliente"><span>Abra o card para concluir as tarefas e avançar</span></div><div id="pvBoard" class="pv-board"></div>`;
    main.appendChild(section);
    b.addEventListener('click',async()=>{document.querySelectorAll('nav button,.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');section.classList.add('active');$('#title').textContent='Pós-Vendas';const novo=$('#novo');if(novo)novo.style.display='none';await carregar();});
    document.querySelectorAll('aside nav button:not(#pvNav)').forEach(btn=>btn.addEventListener('click',()=>{const novo=$('#novo');if(novo)novo.style.display='';}));
    $('#pvAtualizar').onclick=carregar;
    $('#pvBusca').oninput=render;
    $('#pvNovoPedido').onclick=novoPedido;
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
      db.from('posvenda_ambientes').select('id,pedido_id,nome_ambiente,status_ambiente,previsao_fabricacao,prazo_fabricacao_dias_uteis,aprovacao_tecnica_em,arquivo_projeto_url'),
      db.from('posvenda_visitas').select('id,pedido_id,ambiente_id,data_visita,tipo_visita,status_visita,responsavel_visita').order('data_visita',{ascending:true}),
      db.from('posvenda_controle_etapas').select('pedido_id,etapa_nome,iniciado_em,prazo_dias_uteis,prazo_tipo,concluido_em'),
      db.from('posvenda_checklist').select('id,pedido_id,etapa_nome,requisito,concluido')
    ]);
    const falhas=rs.map((r,i)=>r.error?['etapas','pedidos','ambientes','visitas','prazos','tarefas'][i]+': '+errorText(r.error):null).filter(Boolean);
    [etapas,pedidos,ambientes,visitas,controles,checklists]=rs.map(r=>r.data||[]);
    render();
    msg(falhas.length?'Falha ao consultar '+falhas.join(' | '):'Dados atualizados.',!!falhas.length);
  }
  function prazoCard(p){
    const c=controles.find(x=>x.pedido_id===p.id && x.etapa_nome===p.etapa_atual);
    if(!c)return '<small>Prazo: aguardando configuração</small>';
    if(c.prazo_tipo==='cliente')return '<small style="color:#876d2b">Aguardando cliente · sem SLA interno</small>';
    if(c.prazo_tipo==='agendamento')return '<small>Prazo conforme agendamento</small>';
    if(!c.prazo_dias_uteis||!c.iniciado_em)return '<small>Prazo não definido</small>';
    const inicio=new Date(c.iniciado_em),hoje=new Date(),fim=new Date(inicio);
    let dias=0;while(dias<c.prazo_dias_uteis){fim.setDate(fim.getDate()+1);if(fim.getDay()!==0&&fim.getDay()!==6)dias++;}
    const ms=fim.getTime()-hoje.getTime(),restantes=Math.ceil(ms/86400000);
    const atrasado=ms<0,alerta=!atrasado&&(c.prazo_tipo==='por_ambiente'?restantes<=2:restantes<=1);
    return '<small style="font-weight:700;color:'+(atrasado?'#b42318':alerta?'#9a6700':'#27804a')+'">'+(atrasado?'● Atrasado':alerta?'● Prazo próximo':'● No prazo')+' · '+fim.toLocaleDateString('pt-BR')+(c.prazo_tipo==='por_ambiente'?' · prazo base por ambiente':'')+'</small>';
  }
  function render(){
    const q=($('#pvBusca')?.value||'').toLowerCase();
    const filtrados=pedidos.filter(p=>(String(p.numero_pedido||'')+' '+String(p.nome_cliente||'')).toLowerCase().includes(q));
    const hoje=new Date().toISOString().slice(0,10);
    const atrasados=ambientes.filter(a=>a.previsao_fabricacao&&a.previsao_fabricacao<hoje&&!['concluido','concluído','entregue'].includes(String(a.status_ambiente||'').toLowerCase())).length;
    $('#pvIndicadores').innerHTML=`<div><small>Pedidos</small><strong>${pedidos.length}</strong></div><div><small>Ambientes</small><strong>${ambientes.length}</strong></div><div><small>Previsões vencidas*</small><strong>${atrasados}</strong></div><div><small>Visitas</small><strong>${visitas.length}</strong></div>`;
    $('#pvBoard').innerHTML=etapas.length?etapas.map(e=>{
      const cards=filtrados.filter(p=>p.etapa_atual===e.nome);
      return `<div class="pv-col" data-etapa="${E(e.nome)}"><div class="pv-col-title"><b>${E(e.nome)}</b><span>${cards.length}</span></div>${cards.map(p=>`<div class="pv-card" draggable="true" data-pedido="${p.id}" role="button" tabindex="0" title="Clique para editar o pedido"><strong>${E(p.nome_cliente||'Cliente não informado')}</strong><small>Pedido ${E(p.numero_pedido||p.id)}</small><small>${E(p.responsavel_posvenda||'Sem responsável')}</small><small>${ambientes.filter(a=>a.pedido_id===p.id).length} ambiente(s) · ${ambientes.filter(a=>a.pedido_id===p.id&&a.aprovacao_tecnica_em).length} aprovado(s)</small>${prazoCard(p)}</div>`).join('')}</div>`;
    }).join(''):'<p>Não há etapas disponíveis. Verifique as permissões de leitura de posvenda_etapas.</p>';
    document.querySelectorAll('.pv-card').forEach(el=>{
      el.draggable=false;
      el.addEventListener('click',()=>editarPedido(Number(el.dataset.pedido)));
      el.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();editarPedido(Number(el.dataset.pedido));}});
    });
  }
  async function novoPedido(){
    const nome=prompt('Nome do cliente:');if(!nome?.trim())return;
    const numero=prompt('Número do pedido (opcional):')||null;
    const etapa=etapas[0]?.nome||null;
    const {error}=await db.from('posvenda_pedidos').insert({nome_cliente:nome.trim(),numero_pedido:numero,etapa_atual:etapa});
    if(error)msg('Não foi possível cadastrar: '+errorText(error),true);else await carregar();
  }
  function abrirFormulario(titulo,campos,salvar){
    const d=document.createElement('dialog');d.className='pv-form-dialog';
    d.innerHTML='<form><h3>'+E(titulo)+'</h3><div class="pv-form-fields">'+campos+'</div><div class="pv-form-buttons"><button type="button" data-cancel>Cancelar</button><button type="submit" class="primary">Salvar</button></div></form>';
    document.body.appendChild(d);
    d.querySelector('[data-cancel]').onclick=()=>d.close();
    d.addEventListener('close',()=>d.remove());
    d.querySelector('form').onsubmit=async ev=>{
      ev.preventDefault();const b=d.querySelector('[type=submit]');b.disabled=true;
      try{await salvar(new FormData(ev.target));d.close();await carregar();const pd=$('#pvEditarPedidoDialog');if(pd?.open){pd.close();editarPedido(window.pvPedidoSelecionado);}}
      catch(e){msg('Erro ao salvar: '+errorText(e),true);alert('Erro ao salvar: '+errorText(e));}
      finally{b.disabled=false;}
    };d.showModal();
  }
  const PV_BUCKET='lifeup-projetos-tecnicos';
  function pvDocumentoInterno(valor){return String(valor||'').startsWith('storage://'+PV_BUCKET+'/');}
  async function pvVisualizarDocumento(valor){
    if(!valor)return;
    if(!pvDocumentoInterno(valor)){const url=new URL(valor);if(!['https:','http:'].includes(url.protocol))throw Error('Link inválido');window.open(url.href,'_blank','noopener,noreferrer');return;}
    const caminho=valor.slice(('storage://'+PV_BUCKET+'/').length);
    const {data,error}=await db.storage.from(PV_BUCKET).createSignedUrl(caminho,120);
    if(error)throw error;
    window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }
  async function pvEnviarDocumento(file,pedidoId,ambienteId){
    if(!file||!file.size)throw Error('Selecione um arquivo válido.');
    if(file.size>15*1024*1024)throw Error('O arquivo deve ter no máximo 15 MB.');
    const tipos={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'};
    if(!tipos[file.type])throw Error('Use PDF, JPG ou PNG.');
    const caminho='pedidos/'+pedidoId+'/ambientes/'+ambienteId+'/'+crypto.randomUUID()+'.'+tipos[file.type];
    const {error}=await db.storage.from(PV_BUCKET).upload(caminho,file,{contentType:file.type,upsert:false});
    if(error)throw error;
    return 'storage://'+PV_BUCKET+'/'+caminho;
  }
  function abrirAmbiente(pedidoId,ambienteId){
    const a=ambientes.find(x=>x.id===ambienteId)||{};
    abrirFormulario(ambienteId?'Editar ambiente':'Novo ambiente',
      '<label>Ambiente<input name="nome" required value="'+E(a.nome_ambiente||'')+'"></label>'+
      '<label>Status<select name="status"><option value="">Selecione uma etapa</option>'+["Aguardando conferência de medidas","Conferência de medidas realizada","Caderno técnico em elaboração","Aguardando aprovação técnica","Aprovado para fabricação","Em fabricação","Fabricação concluída","Aguardando instalação","Em instalação","Instalação concluída","Finalizado"].map(x=>'<option value="'+E(x)+'" '+(a.status_ambiente===x?'selected':'')+'>'+E(x)+'</option>').join('')+'</select></label>' +
      '<label>Prazo em dias úteis<input name="prazo" type="number" min="1" value="'+E(a.prazo_fabricacao_dias_uteis??35)+'"></label>'+
      '<p class="pv-help">Aprovação técnica: '+E(a.aprovacao_tecnica_em?new Date(a.aprovacao_tecnica_em).toLocaleDateString('pt-BR'):'Pendente')+'. O prazo começa somente após aprovação formal registrada pelo procedimento autorizado, manualmente ou via Autentique.</p>'+
      '<fieldset class="pv-documento"><legend>Documento de aprovação técnica</legend><label>Anexar arquivo (PDF, JPG ou PNG, até 15 MB)<input name="arquivo_upload" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" '+(!ambienteId?'disabled':'')+'></label>'+(!ambienteId?'<small>Salve o ambiente antes de anexar um arquivo.</small>':'')+'<label>Ou adicionar link do documento<input name="arquivo" type="url" placeholder="https://..." value="'+E(pvDocumentoInterno(a.arquivo_projeto_url)?'':a.arquivo_projeto_url||'')+'"></label>'+(a.arquivo_projeto_url?'<button type="button" data-ver-documento>Visualizar documento atual</button>':'')+'</fieldset>'+ 
      '<label>Observações<textarea name="obs">'+E(a.observacoes_tecnicas||'')+'</textarea></label>',
      async f=>{
        const status=String(f.get('status')).trim();
        if(!a.aprovacao_tecnica_em && ['Aprovado para fabricação','Em fabricação','Fabricação concluída','Aguardando instalação','Em instalação','Instalação concluída','Finalizado'].includes(status))throw new Error('Este ambiente ainda não possui aprovação técnica. A liberação deve ocorrer pelo procedimento autorizado.');
        const file=f.get('arquivo_upload');
        const link=String(f.get('arquivo')).trim();
        if(file?.size&&link)throw Error('Escolha somente um método: arquivo ou link.');
        if(file?.size&&(!ambienteId))throw Error('Salve o ambiente antes de anexar.');
        let documento=a.arquivo_projeto_url||null;
        if(file?.size)documento=await pvEnviarDocumento(file,pedidoId,ambienteId);
        else if(link)documento=link;
        else if(!pvDocumentoInterno(documento))documento=null;
        const p={pedido_id:pedidoId,nome_ambiente:String(f.get('nome')).trim(),status_ambiente:status||null,prazo_fabricacao_dias_uteis:Number(f.get('prazo'))||35,observacoes_tecnicas:String(f.get('obs')).trim()||null,arquivo_projeto_url:documento};
        const r=ambienteId?await db.from('posvenda_ambientes').update(p).eq('id',ambienteId):await db.from('posvenda_ambientes').insert(p);if(r.error)throw r.error;
      });
    const ver=document.querySelector('dialog.pv-form-dialog:last-of-type [data-ver-documento]');
    if(ver)ver.onclick=async()=>{try{await pvVisualizarDocumento(a.arquivo_projeto_url);}catch(e){alert('Não foi possível abrir o documento: '+errorText(e));}};
  }
  function abrirVisita(pedidoId,visitaId){
    const v=visitas.find(x=>x.id===visitaId)||{};
    const date=v.data_visita?new Date(new Date(v.data_visita).getTime()-new Date(v.data_visita).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
    abrirFormulario(visitaId?'Editar visita':'Nova visita',
      '<label>Tipo<input name="tipo" required value="'+E(v.tipo_visita||'')+'"></label>'+
      '<label>Data e hora<input name="data" type="datetime-local" required value="'+E(date)+'"></label>'+
      '<label>Ambiente<select name="ambiente"><option value="">Pedido inteiro</option>'+ambientes.filter(a=>a.pedido_id===pedidoId).map(a=>'<option value="'+a.id+'" '+(v.ambiente_id===a.id?'selected':'')+'>'+E(a.nome_ambiente)+'</option>').join('')+'</select></label>'+
      '<label>Responsável<input name="responsavel" value="'+E(v.responsavel_visita||'')+'"></label>'+
      '<label>Status<input name="status" value="'+E(v.status_visita||'')+'"></label>',
      async f=>{
        const dt=new Date(String(f.get('data')));if(Number.isNaN(dt.getTime()))throw Error('Data inválida');
        const p={pedido_id:pedidoId,ambiente_id:f.get('ambiente')?Number(f.get('ambiente')):null,data_visita:dt.toISOString(),tipo_visita:String(f.get('tipo')).trim(),responsavel_visita:String(f.get('responsavel')).trim()||null,status_visita:String(f.get('status')).trim()||null};
        const r=visitaId?await db.from('posvenda_visitas').update(p).eq('id',visitaId):await db.from('posvenda_visitas').insert(p);if(r.error)throw r.error;
      });
  }
  async function aprovarAmbiente(ambienteId){
    if(!admin){msg('Somente administradores podem aprovar projetos técnicos.',true);return;}
    const a=ambientes.find(x=>x.id===ambienteId);
    if(!a){msg('Ambiente não encontrado.',true);return;}
    if(a.aprovacao_tecnica_em){msg('Este ambiente já está aprovado.',true);return;}
    if(!a.arquivo_projeto_url){alert('Primeiro edite o ambiente e informe o link do documento técnico aprovado.');return;}
    const confirmar=confirm('Confirma que o cliente aprovou formalmente o projeto técnico de '+(a.nome_ambiente||'este ambiente')+'?\\n\\nDocumento: '+a.arquivo_projeto_url+'\\n\\nEsta ação inicia a contagem do prazo de fabricação e ficará registrada na auditoria.');
    if(!confirmar)return;
    const {error}=await db.rpc('posvenda_aprovar_manual',{p_ambiente_id:ambienteId});
    if(error){msg('Aprovação não realizada: '+errorText(error),true);alert('Não foi possível aprovar: '+errorText(error));return;}
    await carregar();
    const pd=$('#pvEditarPedidoDialog');
    if(pd?.open){pd.close();editarPedido(window.pvPedidoSelecionado);$('#pvEditarPedidoDialog [data-pv-tab="ambientes"]')?.click();}
    msg('Aprovação registrada. Confira a previsão de fabricação.');
  }
  function editarPedido(id){
    window.pvPedidoSelecionado=id;
    if(!admin)return;
    const pedido=pedidos.find(p=>p.id===id);
    if(!pedido){msg('Pedido não encontrado.',true);return;}
    let dlg=$('#pvEditarPedidoDialog');
    if(!dlg){
      dlg=document.createElement('dialog');
      dlg.id='pvEditarPedidoDialog';
      dlg.style.cssText='border:1px solid #ddd;border-radius:12px;padding:24px;max-width:740px;width:calc(100% - 32px);box-shadow:0 12px 48px #0003;';
      dlg.innerHTML=`<form id="pvEditarPedidoForm">
        <h2 style="margin:0 0 16px">Detalhes do pedido</h2><div class="pv-tabs"><button type="button" data-pv-tab="geral">Dados gerais</button><button type="button" data-pv-tab="ambientes">Ambientes</button><button type="button" data-pv-tab="visitas">Visitas</button></div><div id="pvTabGeral">
        <div style="display:grid;gap:12px">
          <label>Nome do cliente<input name="nome_cliente" required style="width:100%;padding:9px;box-sizing:border-box"></label>
          <label>Número do pedido<input name="numero_pedido" style="width:100%;padding:9px;box-sizing:border-box"></label>
          <label>Responsável pelo pós-vendas<input name="responsavel_posvenda" style="width:100%;padding:9px;box-sizing:border-box"></label>
          <label>Etapa atual (somente leitura)<select name="etapa_atual" disabled style="width:100%;padding:9px;box-sizing:border-box"></select></label><div id="pvTarefasPedido" style="border:1px solid #ddd;border-radius:9px;padding:12px"></div><button type="button" id="pvConcluirTarefa" class="primary">Concluir tarefa e avançar</button>
          <label>Observações<textarea name="observacoes" rows="4" style="width:100%;padding:9px;box-sizing:border-box"></textarea></label>
        </div></div><div id="pvTabAmbientes" hidden><h3>Ambientes deste pedido</h3><div id="pvAmbientesPedido"></div><button type="button" id="pvAddAmbiente">+ Adicionar ambiente</button></div><div id="pvTabVisitas" hidden><h3>Visitas deste pedido</h3><div id="pvVisitasPedido"></div><button type="button" id="pvAddVisita">+ Agendar visita</button></div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
          <button type="button" id="pvCancelarEdicao">Cancelar</button>
          <button class="primary" type="submit" id="pvSalvarEdicao">Salvar alterações</button>
        </div></form>`;
      document.body.appendChild(dlg);
      $('#pvCancelarEdicao').onclick=()=>dlg.close();
      dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close();});
    }
    const tabs={geral:$('#pvTabGeral'),ambientes:$('#pvTabAmbientes'),visitas:$('#pvTabVisitas')};
    const mostrar=t=>{Object.keys(tabs).forEach(k=>tabs[k].hidden=k!==t);$('#pvSalvarEdicao').hidden=t!=='geral';};
    dlg.querySelectorAll('[data-pv-tab]').forEach(b=>b.onclick=()=>mostrar(b.dataset.pvTab));
    mostrar('geral');
    const renderInterno=()=>{
      const aa=ambientes.filter(a=>a.pedido_id===id);
      $('#pvAmbientesPedido').innerHTML=aa.length?aa.map(a=>'<div class="pv-item"><b>'+E(a.nome_ambiente||'Sem nome')+'</b><span>'+E(a.status_ambiente||'Sem status')+' · '+E(a.prazo_fabricacao_dias_uteis??35)+' dias úteis</span><span>Aprovação: '+E(a.aprovacao_tecnica_em?new Date(a.aprovacao_tecnica_em).toLocaleDateString('pt-BR'):'Pendente')+'</span><span>Previsão: '+E(fmtDate(a.previsao_fabricacao))+'</span><button type="button" data-ambiente="'+a.id+'">Editar ambiente</button></div>').join(''):'<p>Nenhum ambiente cadastrado.</p>';
      $('#pvAmbientesPedido').querySelectorAll('[data-ambiente]').forEach(b=>b.onclick=()=>abrirAmbiente(id,Number(b.dataset.ambiente)));
      $('#pvAmbientesPedido').querySelectorAll('[data-ver-arquivo]').forEach(b=>b.onclick=async()=>{try{const a=ambientes.find(x=>x.id===Number(b.dataset.verArquivo));await pvVisualizarDocumento(a?.arquivo_projeto_url);}catch(e){alert('Erro ao abrir documento: '+errorText(e));}});
      $('#pvAmbientesPedido').querySelectorAll('[data-aprovar-ambiente]').forEach(b=>b.onclick=()=>aprovarAmbiente(Number(b.dataset.aprovarAmbiente)));
      const vv=visitas.filter(v=>v.pedido_id===id);
      $('#pvVisitasPedido').innerHTML=vv.length?vv.map(v=>'<div class="pv-item"><b>'+E(v.tipo_visita||'Visita')+'</b><span>'+E(v.data_visita?new Date(v.data_visita).toLocaleString('pt-BR'):'Sem data')+'</span><span>'+E(v.status_visita||'Sem status')+'</span><button type="button" data-visita="'+v.id+'">Editar visita</button></div>').join(''):'<p>Nenhuma visita cadastrada.</p>';
      $('#pvVisitasPedido').querySelectorAll('[data-visita]').forEach(b=>b.onclick=()=>abrirVisita(id,Number(b.dataset.visita)));
    };
    $('#pvAddAmbiente').onclick=()=>abrirAmbiente(id);
    $('#pvAddVisita').onclick=()=>abrirVisita(id);
    renderInterno();
    const form=$('#pvEditarPedidoForm');
    form.elements.nome_cliente.value=pedido.nome_cliente||'';
    form.elements.numero_pedido.value=pedido.numero_pedido||'';
    form.elements.responsavel_posvenda.value=pedido.responsavel_posvenda||'';
    form.elements.observacoes.value=pedido.observacoes||'';
    const sel=form.elements.etapa_atual;
    sel.innerHTML=etapas.map(e=>`<option value="${E(e.nome)}">${E(e.nome)}</option>`).join('');
    sel.value=pedido.etapa_atual||etapas[0]?.nome||'';
    const tarefas=checklists.filter(x=>x.pedido_id===id&&x.etapa_nome===pedido.etapa_atual);
    const area=$('#pvTarefasPedido');
    area.innerHTML='<b>Tarefas obrigatórias</b>'+(tarefas.length?tarefas.map(t=>'<label style="display:block;margin-top:9px"><input type="checkbox" data-tarefa="'+t.id+'" '+(t.concluido?'checked':'')+' '+(t.requisito.includes('Autentique')?'disabled':'')+'> '+E(t.requisito)+'</label>').join(''):'<p>Sem checklist disponível para esta etapa.</p>');
    area.querySelectorAll('[data-tarefa]').forEach(input=>input.onchange=async()=>{
      input.disabled=true;const {error}=await db.rpc('lifeup_marcar_requisito',{p_pedido_id:id,p_requisito_id:Number(input.dataset.tarefa),p_concluido:input.checked});
      if(error){alert('Não foi possível registrar tarefa: '+errorText(error));input.checked=!input.checked;}
      await carregar();input.disabled=false;
    });
    $('#pvConcluirTarefa').onclick=async()=>{
      const botao=$('#pvConcluirTarefa');botao.disabled=true;
      const {data,error}=await db.rpc('lifeup_concluir_etapa',{p_pedido_id:id});
      botao.disabled=false;
      if(error){alert('Não foi possível concluir: '+errorText(error));return;}
      dlg.close();await carregar();msg('Etapa concluída. Próxima etapa: '+data);
    };
    form.onsubmit=async ev=>{
      ev.preventDefault();
      const btn=$('#pvSalvarEdicao');
      const payload={
        nome_cliente:form.elements.nome_cliente.value.trim(),
        numero_pedido:form.elements.numero_pedido.value.trim()||null,
        responsavel_posvenda:form.elements.responsavel_posvenda.value.trim()||null,
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
