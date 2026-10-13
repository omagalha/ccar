'use strict';
(() => {
  const $=id=>document.getElementById(id),admin=window.CCAR_ADMIN,cfg=window.CCAR_CONFIG||{};
  const safe=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const stages=[['new','Novo lead'],['contacted','Contato iniciado'],['qualified','Qualificado'],['visit','Visita agendada'],['proposal','Proposta'],['negotiation','Negociação'],['won','Venda concluída'],['lost','Perdido']];
  const stageLabels=Object.fromEntries(stages);
  const activityLabels={note:'Observação',call:'Ligação',whatsapp:'WhatsApp',visit:'Visita',proposal:'Proposta',stage_change:'Mudança de etapa'};
  let leads=[],interests=[],members=[],currentLead=null,loading=false,inventoryObserver=null;

  const session=()=>admin?.getSession?.();
  const vehicles=()=>admin?.getVehicles?.()||[];
  const request=(path,options={})=>admin.request(path,options,true);
  const notify=(text,error=false)=>admin.message(text,error);
  const memberName=id=>members.find(member=>member.user_id===id)?.display_name||'Equipe C CAR';
  const vehicleById=id=>vehicles().find(vehicle=>vehicle.id===id);
  const vehicleName=id=>{const vehicle=vehicleById(id);return vehicle?`${vehicle.make} ${vehicle.model}${vehicle.version?` ${vehicle.version}`:''}`:'Veículo removido';};
  const leadInterests=id=>interests.filter(interest=>interest.lead_id===id);
  const mainVehicle=id=>{const rows=leadInterests(id);return rows.find(row=>row.is_primary)||rows[0]||null;};
  const formatDate=value=>value?new Date(value).toLocaleDateString('pt-BR'):'—';
  const formatDateTime=value=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Sem retorno agendado';
  const money=value=>value===null||value===''?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(value)||0);
  const localDateTime=value=>{if(!value)return'';const date=new Date(value);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());return date.toISOString().slice(0,16);};
  const phoneDigits=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.length<=11?'55'+digits:digits;};

  function birthdayDistance(birthday){
    if(!birthday)return null;
    const [,month,day]=birthday.split('-').map(Number),today=new Date();today.setHours(0,0,0,0);
    let next=new Date(today.getFullYear(),month-1,day);if(next<today)next=new Date(today.getFullYear()+1,month-1,day);
    return Math.round((next-today)/86400000);
  }

  async function ensureMember(){
    const user=session()?.user;if(!user)return;
    const displayName=user.user_metadata?.full_name||user.user_metadata?.name||String(user.email||'Vendedor').split('@')[0];
    await request('/rest/v1/crm_team_members?on_conflict=user_id',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:user.id,display_name:displayName,email:user.email||''})});
  }

  async function load(){
    if(loading||!session()?.access_token)return;loading=true;
    try{
      await ensureMember();
      const [leadRows,interestRows,memberRows]=await Promise.all([
        request('/rest/v1/crm_leads?select=*&order=updated_at.desc'),
        request('/rest/v1/crm_lead_vehicles?select=*'),
        request('/rest/v1/crm_team_members?select=*&order=display_name.asc')
      ]);
      leads=leadRows||[];interests=interestRows||[];members=memberRows||[];
      $('crmSetupNotice').hidden=true;$('crmWorkspace').hidden=false;$('crmAddLead').disabled=false;
      render();observeInventory();
    }catch(error){
      $('crmSetupNotice').hidden=false;$('crmWorkspace').hidden=true;$('crmAddLead').disabled=true;
      if(!$('crmPanel').hidden)notify('Execute o SQL do CRM no Supabase para ativar esta área.',true);
    }finally{loading=false;}
  }

  function filteredLeads(){
    const term=$('crmSearch').value.trim().toLocaleLowerCase('pt-BR'),seller=$('crmSellerFilter').value,vehicle=$('crmVehicleFilter').value;
    return leads.filter(lead=>{
      const names=leadInterests(lead.id).map(row=>vehicleName(row.vehicle_id)).join(' ');
      return(!seller||lead.assigned_user_id===seller)&&(!vehicle||leadInterests(lead.id).some(row=>row.vehicle_id===vehicle))&&[lead.full_name,lead.phone,lead.email,names].join(' ').toLocaleLowerCase('pt-BR').includes(term);
    });
  }

  function render(){
    renderFilters();renderStats();renderFunnel();renderBirthdays();renderVehicleInterest();augmentInventory();
    $('crmTabCount').textContent=leads.filter(lead=>!['won','lost'].includes(lead.stage)).length;
  }

  function renderFilters(){
    const sellerValue=$('crmSellerFilter').value,vehicleValue=$('crmVehicleFilter').value;
    $('crmSellerFilter').innerHTML='<option value="">Todos os vendedores</option>'+members.map(member=>`<option value="${safe(member.user_id)}">${safe(member.display_name)}</option>`).join('');
    $('crmVehicleFilter').innerHTML='<option value="">Todos os veículos</option>'+vehicles().map(vehicle=>`<option value="${safe(vehicle.id)}">${safe(vehicle.make+' '+vehicle.model+' · '+vehicle.year)}</option>`).join('');
    $('crmSellerFilter').value=sellerValue;$('crmVehicleFilter').value=vehicleValue;
  }

  function renderStats(){
    const active=leads.filter(lead=>!['won','lost'].includes(lead.stage)),now=Date.now();
    $('crmStatActive').textContent=active.length;
    $('crmStatNegotiation').textContent=active.filter(lead=>['proposal','negotiation'].includes(lead.stage)).length;
    $('crmStatPending').textContent=active.filter(lead=>lead.next_contact_at&&new Date(lead.next_contact_at).getTime()<=now).length;
    $('crmStatBirthdays').textContent=leads.filter(lead=>{const days=birthdayDistance(lead.birthday);return days!==null&&days<=30;}).length;
  }

  function leadCard(lead){
    const interest=mainVehicle(lead.id),vehicle=interest?vehicleName(interest.vehicle_id):'Interesse ainda não definido',due=lead.next_contact_at&&new Date(lead.next_contact_at).getTime()<Date.now(),birthday=birthdayDistance(lead.birthday);
    return `<article class="crm-lead-card${due?' is-due':''}" draggable="true" data-lead-id="${safe(lead.id)}"><div class="crm-lead-head"><div><strong>${safe(lead.full_name)}</strong><span>${safe(lead.phone)}</span></div>${birthday!==null&&birthday<=30?`<span class="crm-birthday-chip">🎂 ${birthday===0?'Hoje':birthday+'d'}</span>`:''}</div><p class="crm-lead-vehicle">${safe(vehicle)}</p><div class="crm-lead-meta"><span>${safe(memberName(lead.assigned_user_id))}</span><span>${safe(formatDateTime(lead.next_contact_at))}</span></div><div class="crm-lead-actions"><button type="button" data-crm-action="relationship" data-lead-id="${safe(lead.id)}">Relacionamento</button><button type="button" data-crm-action="edit" data-lead-id="${safe(lead.id)}">Editar</button></div></article>`;
  }

  function renderFunnel(){
    const list=filteredLeads();
    $('crmFunnel').innerHTML=stages.map(([key,label])=>{const rows=list.filter(lead=>lead.stage===key);return `<section class="crm-column" data-stage="${key}"><header><span>${label}</span><strong>${rows.length}</strong></header><div class="crm-column-body" data-drop-stage="${key}">${rows.length?rows.map(leadCard).join(''):'<p class="crm-column-empty">Nenhum lead</p>'}</div></section>`;}).join('');
    $('crmFunnel').querySelectorAll('[draggable]').forEach(card=>card.ondragstart=event=>{event.dataTransfer.setData('text/plain',card.dataset.leadId);card.classList.add('dragging');});
    $('crmFunnel').querySelectorAll('[data-drop-stage]').forEach(column=>{column.ondragover=event=>{event.preventDefault();column.classList.add('drag-over');};column.ondragleave=()=>column.classList.remove('drag-over');column.ondrop=event=>{event.preventDefault();column.classList.remove('drag-over');moveLead(event.dataTransfer.getData('text/plain'),column.dataset.dropStage);};});
  }

  function renderBirthdays(){
    const rows=leads.map(lead=>({lead,days:birthdayDistance(lead.birthday)})).filter(row=>row.days!==null&&row.days<=30).sort((a,b)=>a.days-b.days);
    $('crmBirthdays').innerHTML=rows.length?rows.map(({lead,days})=>`<button type="button" data-crm-action="relationship" data-lead-id="${safe(lead.id)}"><span><strong>${safe(lead.full_name)}</strong><small>${formatDate(lead.birthday)} · ${safe(memberName(lead.assigned_user_id))}</small></span><em>${days===0?'Hoje':days+' dias'}</em></button>`).join(''):'<div class="dashboard-empty">Nenhum aniversário nos próximos 30 dias.</div>';
  }

  function renderVehicleInterest(){
    const groups=vehicles().map(vehicle=>({vehicle,rows:interests.filter(row=>row.vehicle_id===vehicle.id)})).filter(group=>group.rows.length).sort((a,b)=>b.rows.length-a.rows.length);
    $('crmVehicleInterest').innerHTML=groups.length?groups.map(({vehicle,rows})=>`<button type="button" data-crm-filter-vehicle="${safe(vehicle.id)}"><span><strong>${safe(vehicle.make+' '+vehicle.model)}</strong><small>${safe(rows.map(row=>leads.find(lead=>lead.id===row.lead_id)?.full_name).filter(Boolean).join(', '))}</small></span><em>${rows.length} interessado${rows.length===1?'':'s'}</em></button>`).join(''):'<div class="dashboard-empty">Associe um cliente a um veículo para acompanhar a demanda.</div>';
  }

  function openLead(lead=null){
    currentLead=lead;$('crmLeadForm').reset();$('crmLeadId').value=lead?.id||'';$('crmLeadDialogTitle').textContent=lead?'Editar lead':'Novo lead';
    $('crmAssigned').innerHTML=members.map(member=>`<option value="${safe(member.user_id)}">${safe(member.display_name)}</option>`).join('');
    $('crmVehicles').innerHTML=vehicles().map(vehicle=>`<option value="${safe(vehicle.id)}">${safe(vehicle.make+' '+vehicle.model+' · '+vehicle.year+' · '+stageVehicleLabel(vehicle.status))}</option>`).join('');
    if(lead){
      const fields={crmFullName:'full_name',crmPhone:'phone',crmEmail:'email',crmBirthday:'birthday',crmSource:'source',crmStage:'stage',crmAssigned:'assigned_user_id',crmBudget:'budget',crmTradeInDetails:'trade_in_details',crmNotes:'notes',crmLostReason:'lost_reason'};
      for(const[id,key]of Object.entries(fields))$(id).value=lead[key]??'';
      $('crmNextContact').value=localDateTime(lead.next_contact_at);$('crmHasTradeIn').checked=lead.has_trade_in;$('crmConsent').checked=lead.relationship_consent;
      const selected=new Set(leadInterests(lead.id).map(row=>row.vehicle_id));[...$('crmVehicles').options].forEach(option=>option.selected=selected.has(option.value));
    }else{$('crmAssigned').value=session()?.user?.id||members[0]?.user_id||'';$('crmStage').value='new';}
    updatePrimaryOptions();$('crmPrimaryVehicle').value=lead?mainVehicle(lead.id)?.vehicle_id||'':'';$('crmTradeInDetails').disabled=!$('crmHasTradeIn').checked;$('crmLeadDialog').showModal();
  }

  function stageVehicleLabel(status){return({published:'disponível',draft:'rascunho',sold:'vendido'})[status]||status;}
  function updatePrimaryOptions(){
    const previous=$('crmPrimaryVehicle').value,selected=[...$('crmVehicles').selectedOptions];
    $('crmPrimaryVehicle').innerHTML='<option value="">Nenhum principal</option>'+selected.map(option=>`<option value="${safe(option.value)}">${safe(option.textContent)}</option>`).join('');
    if(selected.some(option=>option.value===previous))$('crmPrimaryVehicle').value=previous;
  }

  async function saveLead(event){
    event.preventDefault();$('crmSaveLead').disabled=true;
    const id=$('crmLeadId').value||crypto.randomUUID(),existing=leads.find(lead=>lead.id===id),selected=[...$('crmVehicles').selectedOptions].map(option=>option.value),primary=$('crmPrimaryVehicle').value||selected[0]||null,userId=session().user.id;
    const record={id,full_name:$('crmFullName').value.trim(),phone:$('crmPhone').value.trim(),email:$('crmEmail').value.trim(),birthday:$('crmBirthday').value||null,source:$('crmSource').value,stage:$('crmStage').value,assigned_user_id:$('crmAssigned').value||null,budget:$('crmBudget').value===''?null:Number($('crmBudget').value),has_trade_in:$('crmHasTradeIn').checked,trade_in_details:$('crmHasTradeIn').checked?$('crmTradeInDetails').value.trim():'',next_contact_at:$('crmNextContact').value?new Date($('crmNextContact').value).toISOString():null,relationship_consent:$('crmConsent').checked,notes:$('crmNotes').value.trim(),lost_reason:$('crmStage').value==='lost'?$('crmLostReason').value.trim():'',updated_by:userId};
    if(!existing)record.created_by=userId;
    try{
      await request('/rest/v1/crm_leads'+(existing?'?id=eq.'+encodeURIComponent(id):''),{method:existing?'PATCH':'POST',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(record)});
      await request('/rest/v1/crm_lead_vehicles?lead_id=eq.'+encodeURIComponent(id),{method:'DELETE'});
      if(selected.length)await request('/rest/v1/crm_lead_vehicles',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(selected.map(vehicleId=>({lead_id:id,vehicle_id:vehicleId,is_primary:vehicleId===primary})))});
      if(!existing)await addActivity(id,'note','Lead cadastrado no CRM.');
      else if(existing.stage!==record.stage)await addActivity(id,'stage_change',`Etapa alterada de ${stageLabels[existing.stage]} para ${stageLabels[record.stage]}.`);
      $('crmLeadDialog').close();await load();notify('Lead salvo com sucesso.');
    }catch(error){notify(error.message||'Não foi possível salvar o lead.',true);}finally{$('crmSaveLead').disabled=false;}
  }

  async function moveLead(id,stage){
    const lead=leads.find(item=>item.id===id);if(!lead||lead.stage===stage)return;
    try{await request('/rest/v1/crm_leads?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({stage,updated_by:session().user.id})});await addActivity(id,'stage_change',`Etapa alterada de ${stageLabels[lead.stage]} para ${stageLabels[stage]}.`);lead.stage=stage;render();notify('Etapa do lead atualizada.');}catch(error){notify(error.message,true);}
  }

  async function addActivity(leadId,type,description){
    await request('/rest/v1/crm_activities',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({lead_id:leadId,activity_type:type,description,created_by:session().user.id})});
    if(['call','whatsapp','visit','proposal'].includes(type))await request('/rest/v1/crm_leads?id=eq.'+encodeURIComponent(leadId),{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({last_contact_at:new Date().toISOString(),updated_by:session().user.id})});
  }

  async function openRelationship(lead){
    currentLead=lead;$('crmRelationshipTitle').textContent=lead.full_name;const primary=mainVehicle(lead.id);$('crmRelationshipSummary').innerHTML=`<div><span>WhatsApp</span><strong>${safe(lead.phone)}</strong></div><div><span>Responsável</span><strong>${safe(memberName(lead.assigned_user_id))}</strong></div><div><span>Interesse principal</span><strong>${safe(primary?vehicleName(primary.vehicle_id):'Não definido')}</strong></div><div><span>Próximo contato</span><strong>${safe(formatDateTime(lead.next_contact_at))}</strong></div>`;$('crmMessageTemplate').value=birthdayDistance(lead.birthday)===0?'birthday':'followup';updateMessage();$('crmConsentWarning').textContent=lead.relationship_consent?'Contato autorizado pelo cliente.':'Contato de relacionamento não autorizado no cadastro.';$('crmConsentWarning').classList.toggle('warning',!lead.relationship_consent);$('crmOpenWhatsApp').disabled=!lead.relationship_consent;$('crmRelationshipDialog').showModal();await loadActivities(lead.id);
  }

  function updateMessage(){
    if(!currentLead)return;const first=currentLead.full_name.split(/\s+/)[0],primary=mainVehicle(currentLead.id),vehicle=primary?vehicleName(primary.vehicle_id):'veículo que você procura',seller=memberName(currentLead.assigned_user_id),templates={followup:`Olá, ${first}! Tudo bem? Aqui é ${seller}, da C CAR Automóveis. Estou entrando em contato para acompanhar seu interesse e saber como posso ajudar na escolha do seu próximo carro.`,vehicle:`Olá, ${first}! Aqui é ${seller}, da C CAR Automóveis. Estou entrando em contato sobre o ${vehicle}. Posso enviar mais detalhes ou agendar uma visita?`,birthday:`Olá, ${first}! A equipe C CAR Automóveis deseja um feliz aniversário, com muita saúde, conquistas e bons caminhos. Conte sempre conosco!`};$('crmMessagePreview').value=templates[$('crmMessageTemplate').value];
  }

  async function loadActivities(leadId){
    try{const rows=await request('/rest/v1/crm_activities?lead_id=eq.'+encodeURIComponent(leadId)+'&select=*&order=created_at.desc');$('crmActivityList').innerHTML=rows?.length?rows.map(row=>`<article><span>${safe(activityLabels[row.activity_type]||row.activity_type)} · ${safe(memberName(row.created_by))}</span><p>${safe(row.description)}</p><time>${safe(formatDateTime(row.created_at))}</time></article>`).join(''):'<div class="dashboard-empty">Nenhuma atividade registrada.</div>';}catch(_){$('crmActivityList').innerHTML='<div class="dashboard-empty">Não foi possível carregar o histórico.</div>';}
  }

  async function saveActivity(event){
    event.preventDefault();if(!currentLead)return;const button=$('crmActivityForm').querySelector('button');button.disabled=true;
    try{await addActivity(currentLead.id,$('crmActivityType').value,$('crmActivityDescription').value.trim());$('crmActivityDescription').value='';await loadActivities(currentLead.id);notify('Atividade registrada.');}catch(error){notify(error.message,true);}finally{button.disabled=false;}
  }

  async function openWhatsApp(){
    if(!currentLead?.relationship_consent)return;const text=$('crmMessagePreview').value.trim();if(!text)return;
    window.open('https://wa.me/'+phoneDigits(currentLead.phone)+'?text='+encodeURIComponent(text),'_blank','noopener,noreferrer');
    await addActivity(currentLead.id,'whatsapp','Mensagem preparada e WhatsApp aberto.').catch(()=>{});loadActivities(currentLead.id);
  }

  function handleAction(event){
    const vehicleButton=event.target.closest('[data-crm-filter-vehicle]');if(vehicleButton){$('crmVehicleFilter').value=vehicleButton.dataset.crmFilterVehicle;renderFunnel();return;}
    const button=event.target.closest('[data-crm-action]');if(!button)return;const lead=leads.find(item=>item.id===button.dataset.leadId);if(!lead)return;if(button.dataset.crmAction==='edit')openLead(lead);else openRelationship(lead);
  }

  function augmentInventory(){
    const grid=$('adminVehicleGrid');if(!grid)return;const counts=new Map();interests.forEach(row=>counts.set(row.vehicle_id,(counts.get(row.vehicle_id)||0)+1));const cards=[...grid.querySelectorAll('.admin-vehicle-card')],expected=cards.filter(card=>counts.get(card.querySelector('[data-id]')?.dataset.id)).length,signature=cards.map(card=>{const id=card.querySelector('[data-id]')?.dataset.id||'';return id+':'+(counts.get(id)||0);}).join('|');if(grid.dataset.crmSignature===signature&&grid.querySelectorAll('[data-crm-vehicle]').length===expected)return;grid.dataset.crmSignature=signature;grid.querySelectorAll('[data-crm-vehicle],.crm-interest-badge').forEach(element=>element.remove());cards.forEach(card=>{const id=card.querySelector('[data-id]')?.dataset.id,count=counts.get(id)||0;if(!count)return;card.querySelector('.admin-vehicle-meta')?.insertAdjacentHTML('beforeend',` <span class="crm-interest-badge">· ${count} interessado${count===1?'':'s'}</span>`);card.querySelector('.admin-card-actions')?.insertAdjacentHTML('afterbegin',`<button type="button" data-crm-vehicle="${safe(id)}">${count} cliente${count===1?'':'s'} interessado${count===1?'':'s'}</button>`);});
  }

  function observeInventory(){
    if(inventoryObserver)return;const grid=$('adminVehicleGrid');if(!grid)return;inventoryObserver=new MutationObserver(augmentInventory);inventoryObserver.observe(grid,{childList:true,subtree:true});grid.addEventListener('click',event=>{const button=event.target.closest('[data-crm-vehicle]');if(!button)return;$('crmVehicleFilter').value=button.dataset.crmVehicle;admin.activateTab('crm');renderFunnel();});
  }

  $('crmAddLead').onclick=()=>openLead();$('crmLeadForm').onsubmit=saveLead;$('crmVehicles').onchange=updatePrimaryOptions;$('crmHasTradeIn').onchange=()=>{$('crmTradeInDetails').disabled=!$('crmHasTradeIn').checked;};$('crmSearch').oninput=renderFunnel;$('crmSellerFilter').onchange=renderFunnel;$('crmVehicleFilter').onchange=renderFunnel;$('crmFunnel').addEventListener('click',handleAction);$('crmBirthdays').addEventListener('click',handleAction);$('crmVehicleInterest').addEventListener('click',handleAction);$('crmMessageTemplate').onchange=updateMessage;$('crmOpenWhatsApp').onclick=openWhatsApp;$('crmActivityForm').onsubmit=saveActivity;
  window.CCAR_CRM={load};window.addEventListener('ccar:admin-ready',load);if(!$('adminWorkspace').hidden)load();
})();
