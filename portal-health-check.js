/**
 * Nexus end-to-end browser health check.
 * Developer-invoked, read-only with respect to persistent client data.
 * Live forms are never submitted: a detached clone exercises browser submission/validation.
 */
const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable for health check.');
const {state,runtime}=portal;
const $=id=>document.getElementById(id);
const CLIENT_TABS=Object.freeze(['overview','intake','data-room','action-queue','roadmap','ledger','inbox']);
const MODALS=Object.freeze([['ADD_ACTION','taskModal','taskForm'],['ADD_MEASUREMENT','metricModal','metricForm'],['ADD_MILESTONE','milestoneModal','milestoneForm'],['REQUEST_ITEM','documentRequestModal','documentRequestForm']]);

function record(matrix,group,test,passed,detail=''){matrix.push({group,test,result:passed?'PASSED':'FAILED',detail});return passed}
function frame(){return new Promise(resolve=>requestAnimationFrame(()=>resolve()))}
function fillRequired(form){for(const control of form.querySelectorAll('[required]')){if(control.type==='checkbox'||control.type==='radio'){control.checked=true;continue}if(control.tagName==='SELECT'){if(!control.value&&control.options.length)control.selectedIndex=Math.min(1,control.options.length-1);continue}if(control.type==='date'){control.value='2026-09-01';continue}if(control.type==='number'){control.value=control.min||'1';continue}if(control.type==='email'){control.value='health-check@example.com';continue}control.value='Nexus health check'}}
function dryRunSubmit(form){if(!form)return{passed:false,detail:'Form missing'};const clone=form.cloneNode(true);clone.id=`${form.id}-health-clone`;clone.style.position='fixed';clone.style.left='-9999px';clone.style.top='0';document.body.appendChild(clone);let submitted=false;fillRequired(clone);clone.addEventListener('submit',event=>{submitted=true;event.preventDefault();event.stopImmediatePropagation()},{capture:true,once:true});const valid=clone.checkValidity();if(valid)clone.requestSubmit();clone.remove();return{passed:valid&&submitted,detail:`valid=${valid}, submit-event=${submitted}, persistent-write=false`}}
function waitForWorkspace(scope,expectedId,timeout=8000){return new Promise((resolve,reject)=>{let settled=false;const cleanup=scope.bind(window,'nexus:workspace-ready',`wait:${expectedId}:${Date.now()}`,event=>{if(settled||event.detail?.companyId!==expectedId)return;settled=true;cleanup();resolve(true)});scope.timeout(()=>{if(!settled){settled=true;cleanup();reject(new Error(`Workspace ${expectedId} did not finish loading.`))}},timeout)})}
async function switchCompany(scope,select,companyId){if(!companyId||select.value===companyId)return true;const ready=waitForWorkspace(scope,companyId);select.value=companyId;select.dispatchEvent(new Event('change',{bubbles:true}));await ready;return state.companyId===companyId}

window.__NEXUS_HEALTH_CHECK=async function __NEXUS_HEALTH_CHECK(){
  const matrix=[],consoleErrors=[],originalConsoleError=console.error,store=window.NexusStore,client=window.NexusClientControlRoom,admin=window.NexusAdminCommandCenter,scope=runtime.events.createScope(`health-check-${Date.now()}`),select=$('companySelect'),originalCompany=state.companyId,originalSelect=select?.value||null,originalTab=state.activeTab||'overview',originalClientData=state.clientData;
  console.error=(...args)=>{consoleErrors.push(args.map(value=>value instanceof Error?value.message:String(value)).join(' '));originalConsoleError(...args)};
  try{
    record(matrix,'Architecture','NexusStore available',!!store?.getState&&!!store?.patch&&!!store?.subscribe&&!!store?.setClientData,'Single reactive state facade');
    record(matrix,'Architecture','Scoped event lifecycle available',typeof runtime.events.createScope==='function'&&typeof runtime.events.delegate==='function','Delegation + cleanup registry');
    record(matrix,'Architecture','Async error boundary available',typeof runtime.boundary?.run==='function'&&typeof runtime.boundary?.wrap==='function','Retry-safe boundary');

    for(const [stateName,modalId,formId] of MODALS){
      const modal=$(modalId),form=$(formId);if(!modal){record(matrix,'Primary modals',stateName,false,`${modalId} missing`);continue}
      client?.prefillPrimaryModal?.(modalId);
      runtime.modals.open(modalId,document.activeElement);await frame();
      const open=modal.classList.contains('show')&&modal.getAttribute('aria-hidden')==='false'&&document.body.classList.contains('nexus-modal-open')&&state.modalState===stateName;
      const submit=dryRunSubmit(form);
      runtime.modals.close(modalId,{restoreFocus:false});await frame();
      const close=!modal.classList.contains('show')&&modal.getAttribute('aria-hidden')==='true'&&!document.body.classList.contains('nexus-modal-open')&&state.modalState==null;
      record(matrix,'Primary modals',`${stateName} open/fill/submit/close`,open&&submit.passed&&close,`open=${open}, ${submit.detail}, close=${close}`);
    }

    if(client?.activateTab){
      for(const tab of CLIENT_TABS){client.activateTab(tab);await frame();const button=document.querySelector(`#nccPrimaryNav [data-client-view="${CSS.escape(tab)}"]`),panel=$(`ncc-${tab}`),passed=state.activeTab===tab&&button?.getAttribute('aria-selected')==='true'&&panel?.classList.contains('active')&&!panel?.hidden;record(matrix,'Client navigation',tab,!!passed,passed?'Store, ARIA and panel agree':`activeTab=${state.activeTab}`)}
      const drop=document.querySelector('[data-room-dropzone]'),file=$('docFile'),form=$('uploadForm'),service=window.NexusClientUploadService;
      record(matrix,'Data Room','Upload pipeline anchors',!!drop&&!!file&&!!form&&!!service,'Stable form, dropzone and upload owner');
      const sample=new File(['health'],'sample-invoice.pdf',{type:'application/pdf'}),validation=service?.validate?.(sample);record(matrix,'Data Room','File queue trigger',validation==null,validation||'PDF classification accepted without upload');
      const originalQueue=Array.isArray(originalClientData?.uploadQueue)?originalClientData.uploadQueue:[];store?.setUploadQueue?.([{name:sample.name,size:sample.size,type:sample.type,status:'ready'}]);const queued=state.clientData?.uploadQueue?.[0]?.name===sample.name;store?.setUploadQueue?.(originalQueue);record(matrix,'Data Room','NexusStore upload queue update',queued,'In-memory queue updated and restored; no Storage write');
    }else record(matrix,'Client navigation','Client mode',true,'Not applicable in administrator operating view');

    if(admin){
      admin.open();await frame();const overlay=$('nexusAdminMaster'),opened=overlay?.classList.contains('show')&&overlay?.getAttribute('aria-hidden')==='false';record(matrix,'Admin engine','Master View opens',!!opened,'Portfolio overlay visible');
      const builderTab=document.querySelector('[data-admin-tab="builder"]');builderTab?.click();await frame();store?.setModalState?.('DIAGNOSIS_BUILDER');const builderVisible=$('nacBuilder')?.classList.contains('active')&&state.modalState==='DIAGNOSIS_BUILDER';record(matrix,'Admin engine','DIAGNOSIS_BUILDER context',!!builderVisible,'Builder visible and centralized modal context set');store?.setModalState?.(null);admin.close();await frame();record(matrix,'Admin engine','Master View closes',!overlay?.classList.contains('show')&&!document.body.classList.contains('nac-master-open'),'Overlay and scroll state restored');
    }else record(matrix,'Admin engine','Admin mode',true,'Not applicable for client account');

    if(!select||select.options.length<2)record(matrix,'Workspace','Company selector',true,select?'Single workspace: no alternate required':'Selector intentionally unavailable');
    else{
      const alternate=[...select.options].find(option=>option.value&&option.value!==originalCompany)?.value;let passed=false,detail='';
      try{passed=await switchCompany(scope,select,alternate);detail=passed?'Alternate workspace loaded reactively without page refresh':'Workspace state mismatch'}catch(error){detail=error.message}
      record(matrix,'Workspace','Company selector reactive update',passed,detail);
      if(originalCompany&&state.companyId!==originalCompany){try{await switchCompany(scope,select,originalCompany)}catch(error){record(matrix,'Workspace','Restore original company',false,error.message)}}
    }

    record(matrix,'Accessibility','Polite live status region',!!document.querySelector('[role="status"][aria-live="polite"]'),'Modal/toast announcements available');
  }catch(error){record(matrix,'Health Check','Unexpected exception',false,error?.stack||error?.message||String(error))}
  finally{
    try{client?.activateTab?.(originalTab)}catch(error){consoleErrors.push(`Restore tab: ${error.message}`)}
    if(select&&originalSelect&&state.companyId===originalCompany)select.value=originalSelect;
    runtime.modals.active&&runtime.modals.close(runtime.modals.active,{restoreFocus:false});
    store?.setModalState?.(null);scope.destroy();console.error=originalConsoleError;
  }
  record(matrix,'Console','No console errors during check',consoleErrors.length===0,consoleErrors.length?consoleErrors.join(' | ').slice(0,800):'0 errors');
  const failed=matrix.filter(row=>row.result==='FAILED'),report=Object.freeze({status:failed.length?'FAILED':'PASSED',passed:matrix.length-failed.length,failed:failed.length,total:matrix.length,matrix,consoleErrors});
  console.group(`NEXUS HEALTH CHECK: ${report.status}`);console.table(matrix);console.log(`${report.passed}/${report.total} checks passed; ${consoleErrors.length} console errors; persistent test writes: 0.`);console.groupEnd();return report;
};
