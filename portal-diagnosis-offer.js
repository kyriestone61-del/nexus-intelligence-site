const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountDiagnosisOffer(root,portal){
  let snapshot=null,sequence=0,plans=[],busy=false;
  async function refresh(value){
    snapshot=value;const version=++sequence,company=value?.company_id;
    if(!company){root.replaceChildren();return}
    const {data,error}=await portal.sb.from('nexus_build_plans').select('id,status,total_cents,currency').eq('company_id',company).eq('purchase_kind','diagnosis').eq('status','awaiting_payment');
    if(version!==sequence||company!==portal.state.companyId)return;
    if(error){root.innerHTML=`<p role="alert">${esc(error.message)}</p>`;return}
    plans=data||[];
    if(value.diagnosis?.access){root.innerHTML='<p>Diagnosis access is available for this workspace.</p>';return}
    const offer=value.offer,plan=plans[0],price=new Intl.NumberFormat(undefined,{style:'currency',currency:plan?.currency||offer.currency}).format((plan?.total_cents??offer.price_cents)/100);
    root.innerHTML=`<article class="relystra-build-card"><h2>Operational Diagnosis · ${esc(price)}</h2><p>Begin after the 15–20 minute fit call. The diagnosis includes structured operational analysis, workflow findings, a missing-information review, pre-build Actions and a preliminary Build roadmap.</p>
      ${offer.checkout_enabled?`<button class="btn primary" data-diagnosis-purchase>${plans.length?'Continue diagnosis payment':'Review & purchase diagnosis'}</button>`:'<p>Relystra is preparing payment access. Your workspace is available while setup is completed.</p>'}${plan?'<button class="btn secondary" data-diagnosis-cancel>Cancel unpaid diagnosis plan</button>':''}</article>`;
  }
  const click=async event=>{
    const purchase=event.target.closest('[data-diagnosis-purchase]'),cancel=event.target.closest('[data-diagnosis-cancel]');
    if((!purchase&&!cancel)||busy||snapshot?.company_id!==portal.state.companyId)return;
    busy=true;const company=snapshot.company_id,button=event.target.closest('button');button.disabled=true;
    try{
      let id=plans[0]?.id;
      if(cancel&&!id)return;
      if(!id){const result=await portal.sb.rpc('relystra_create_diagnosis_plan',{p_company_id:company});if(result.error)throw result.error;id=result.data}
      const {data,error}=await portal.sb.functions.invoke('relystra-checkout',{body:{plan_id:id,operation:cancel?'cancel':'checkout'}});
      if(error||data?.error)throw new Error(data?.message||error?.message||'Payment could not be opened.');
      if(company!==portal.state.companyId)return;
      if(cancel){
        portal.toast?.(data.status==='cancelled'?'Unpaid diagnosis plan cancelled.':data.status==='paid'?'Payment confirmed.':'Payment is being verified.');
        await refresh(snapshot);
        window.dispatchEvent(new CustomEvent('relystra:delivery-changed',{detail:{companyId:company}}));
      }else if(data.url){const url=new URL(data.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw new Error('Unexpected checkout destination.');location.assign(url.href)}
      else {portal.toast?.('Payment is being verified. Refresh the workspace shortly.');window.dispatchEvent(new CustomEvent('relystra:delivery-changed',{detail:{companyId:company}}))}
    }catch(error){portal.toast?.(error.message||'Payment could not be opened.')}
    finally{busy=false;if(button.isConnected)button.disabled=false}
  };
  root.addEventListener('click',click);
  return {refresh,destroy(){sequence++;root.removeEventListener('click',click)}};
}
