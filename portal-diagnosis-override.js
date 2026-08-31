(function(){
  const portal=window.NexusPortal;if(!portal)return;
  const {sb,state,toast}=portal;
  const company=()=>state.companies?.find(c=>c.id===state.companyId)||null;
  const project=()=>state.projects?.[0]||null;
  const byId=id=>document.getElementById(id);
  const selectedEvidence=()=>[...document.querySelectorAll('.diagnosis-supporting-doc:checked')].map(x=>x.value);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const observerOptions={childList:true,subtree:true};
  let observer=null,normalizationScheduled=false;

  function setHTML(node,html){if(node&&node.innerHTML!==html)node.innerHTML=html}

  async function securedQueue(){
    if(!state.admin||!state.companyId)return toast?.('Select a client company first.');
    const transcriptId=byId('diagnosisTranscriptDoc')?.value||null;
    const selected=selectedEvidence();if(transcriptId&&!selected.includes(transcriptId))selected.unshift(transcriptId);
    const notes=byId('intakeNotes')?.value?.trim()||'';
    const transcript=byId('intakeTranscriptText')?.value?.trim()||'';
    if(!transcriptId&&!transcript&&!notes)return toast?.('Add a transcript, paste transcript text, or enter discovery notes before queueing a diagnosis.');
    const c=company(),p=project(),docs=(state.docs||[]).filter(d=>selected.includes(d.id));
    const packet={version:2,company:{id:c?.id||state.companyId,name:c?.name||'',industry:c?.industry||'',website:c?.website||''},project:{id:p?.id||null,name:p?.name||'',service_type:p?.service_type||''},agent:{code:'client_diagnosis',mode:'secured_execution',permission_level:'draft_only'},meeting:{date:byId('intakeMeetingDate')?.value||null,participants:byId('intakeParticipants')?.value?.trim()||null},discovery_notes:notes||null,transcript_text:transcript||null,evidence_manifest:docs.map(d=>({id:d.id,file_name:d.file_name,category:d.category,note:d.note||null,created_at:d.created_at})),required_output:['facts','client_statements','inferences','unknowns','process_map','bottlenecks','baseline_gaps','baseline_measurements','opportunity_backlog','risks','follow_up_questions','smallest_safe_pilot','nexus_actions','client_action_items','document_requests','decision_items'],prohibited_actions:['send emails','contact anyone','modify client systems','make purchases','publish content','change permissions','take external action without explicit approval']};
    const row={company_id:state.companyId,project_id:p?.id||null,agent_code:'client_diagnosis',status:'queued',queued_at:new Date().toISOString(),transcript_document_id:transcriptId,supporting_document_ids:selected,meeting_date:packet.meeting.date,participants:packet.meeting.participants,discovery_notes:notes||null,analysis_packet:packet,created_by:state.user.id,updated_at:new Date().toISOString()};
    const button=byId('queueDiagnosisBtn');if(button){button.disabled=true;button.textContent='Analyzing…'}
    try{
      const {data:created,error}=await sb.from('nexus_diagnosis_runs').insert(row).select('id').single();if(error)throw error;
      toast?.('Diagnosis queued. Secured analysis is running.');
      const {data,error:invokeError}=await sb.functions.invoke('nexus-diagnosis-execute',{body:{run_id:created.id}});
      if(invokeError||data?.ok===false)throw new Error(data?.error||invokeError?.message||'Diagnosis execution failed.');
      toast?.('Diagnosis is ready for review.');
      window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed'));
      sessionStorage.setItem('nexus_reopen_intake','1');
      setTimeout(()=>location.reload(),450);
    }catch(error){
      toast?.(error.message||'Diagnosis could not be completed.');
      if(button){button.disabled=false;button.textContent='Queue diagnosis →'}
      normalizeCards();
    }
  }

  function normalizeCards(){
    observer?.disconnect();
    try{
      document.querySelectorAll('.diagnosis-run-card').forEach(card=>{
        const statusEl=card.querySelector('.diagnosis-status');if(!statusEl)return;
        const status=[...statusEl.classList].find(x=>['queued','analyzing','ready_for_review','revision_requested','blocked','approved','failed','archived','ready_for_analysis','in_review'].includes(x))||String(statusEl.textContent||'').trim().toLowerCase().replaceAll(' ','_');
        const select=card.querySelector('.diagnosis-status-select');const id=select?.dataset.id||card.querySelector('[data-id]')?.dataset.id;
        select?.remove();
        card.querySelectorAll('.copy-agent-packet').forEach(x=>x.remove());
        let action=card.querySelector('.diagnosis-secure-action');
        if(!action&&id){action=document.createElement('div');action.className='diagnosis-secure-action';card.querySelector('.diagnosis-run-actions')?.appendChild(action)}
        if(!action)return;
        let html='';
        if(status==='queued')html='<span class="small">Queued for secured analysis.</span>';
        else if(status==='ready_for_analysis')html=`<button class="btn primary diagnosis-retry-btn" data-id="${esc(id)}" type="button">Run secured diagnosis →</button>`;
        else if(status==='analyzing')html='<span class="small">Analyzing authorized evidence…</span>';
        else if(['ready_for_review','in_review'].includes(status))html=`<button class="btn primary diagnosis-review-btn" data-id="${esc(id)}" type="button">Review diagnosis →</button>`;
        else if(status==='approved')html=`<button class="btn secondary diagnosis-review-btn" data-id="${esc(id)}" type="button">Open approved diagnosis →</button>`;
        else if(['blocked','failed','revision_requested'].includes(status))html=`<button class="btn secondary diagnosis-retry-btn" data-id="${esc(id)}" type="button">Retry diagnosis →</button>`;
        else html='<span class="small">Archived</span>';
        setHTML(action,html);
      });
      const help=document.querySelector('.admin-intake-help');
      setHTML(help,'<b>Execution boundary:</b> The secured Client Diagnosis Agent reads only the evidence selected here. Its output remains an internal draft until a Nexus admin reviews it. Approval may generate controlled workspace records; it never sends external communications or changes client systems automatically.');
      const step4=[...document.querySelectorAll('.intake-card')].find(x=>x.querySelector('.kicker')?.textContent?.includes('Step 4'));
      if(step4){const p=step4.querySelector('h2 + p');setHTML(p,'Queueing starts secured analysis of the selected authorized evidence. The result is stored as a structured internal draft for human review.')}
    }finally{
      observer?.observe(document.body,observerOptions);
    }
  }

  function scheduleNormalize(){
    if(normalizationScheduled)return;
    normalizationScheduled=true;
    requestAnimationFrame(()=>{normalizationScheduled=false;normalizeCards()});
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('#queueDiagnosisBtn');if(!btn)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();securedQueue();
  },true);

  observer=new MutationObserver(scheduleNormalize);
  observer.observe(document.body,observerOptions);
  normalizeCards();
  if(sessionStorage.getItem('nexus_reopen_intake')==='1'){
    sessionStorage.removeItem('nexus_reopen_intake');
    const open=()=>document.querySelector('.side-nav button[data-section="intake"]')?.click();setTimeout(open,650);setTimeout(open,1400);
  }
})();
