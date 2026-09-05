const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable for task file attachments.');

const {sb,state,toast,runtime}=portal;
const FILE_TASK_TYPES=new Set(['upload','workflow_evidence']);
const TERMINAL=new Set(['complete','completed','done','resolved','approved','released','implemented','closed','cancelled','canceled','archived']);
const REVIEW=new Set(['ready_for_review','in_review','pending_review','submitted','reviewing']);
const ACCEPT='.pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg';
let scheduled=false;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const norm=value=>String(value||'').trim().toLowerCase().replaceAll(' ','_');
const taskById=id=>(state.tasks||[]).find(task=>String(task.id)===String(id))||null;
const taskDocs=task=>{
  const legacyIds=new Set(Array.isArray(task?.response_data?.attachment_ids)?task.response_data.attachment_ids.map(String):[]);
  return (state.docs||[]).filter(doc=>String(doc.task_id||'')===String(task?.id||'')||legacyIds.has(String(doc.id)));
};
const isClientOwned=task=>task&&String(task.assignee||'').toLowerCase()==='client'&&!TERMINAL.has(norm(task.status))&&!REVIEW.has(norm(task.status));
const isReadOnly=()=>state.previewReadOnly===true||state.admin===true;
const isFileTask=task=>FILE_TASK_TYPES.has(norm(task?.task_type))||/upload|evidence|report|business records|supporting document/i.test(String(task?.title||''));

function fileRows(task){
  const docs=taskDocs(task);
  if(!docs.length)return '<div class="task-file-empty">No files attached yet.</div>';
  return `<div class="task-file-list">${docs.map(doc=>`<div class="task-file-row"><div><b>${esc(doc.file_name||'Attached file')}</b><small>${doc.size_bytes?`${Math.max(1,Math.round(Number(doc.size_bytes)/1024))} KB`:esc(doc.category||'File')}</small></div><button type="button" class="btn secondary" data-task-file-download="${esc(doc.id)}">Download</button></div>`).join('')}</div>`;
}

function uploader(task){
  if(isReadOnly())return '<div class="task-file-admin-note">The client can upload files directly to this action from their account.</div>';
  if(!isClientOwned(task))return '<div class="task-file-admin-note">This action is no longer waiting for a client upload.</div>';
  return `<div class="task-file-uploader"><label><span>Choose file(s)</span><input type="file" multiple accept="${ACCEPT}" data-task-file-input="${esc(task.id)}"></label><button type="button" class="btn primary" data-task-file-upload="${esc(task.id)}">Upload selected files</button><small>PDF, Word, Excel, CSV, TXT, PNG or JPG · up to 25 MB each.</small></div>`;
}

function panelMarkup(task,{compact=false}={}){
  const count=taskDocs(task).length;
  return `<section class="task-file-panel${compact?' compact':''}" data-task-file-panel="${esc(task.id)}"><div class="task-file-panel-head"><div><span>${compact?'ACTION FILES':'FILES FOR THIS ACTION'}</span><b>${count?`${count} ${count===1?'file':'files'} attached`:'Upload files here'}</b></div></div><p>${compact?'Files stay connected to this action so both the client and Relystra can find them later.':'Add the file or files requested for this action here. They stay attached to this action, so you do not need to leave the page or upload them again somewhere else.'}</p>${fileRows(task)}${uploader(task)}</section>`;
}

async function download(id){
  try{await portal.downloadDocument?.(id)}catch(error){console.error('Task attachment download failed',error);toast?.(error.message||'The file could not be downloaded.')}
}

async function upload(task,input,button){
  if(isReadOnly()){toast?.('Client View is read-only from the administrator account.');return}
  if(!isClientOwned(task)){toast?.('This action is no longer waiting for a client upload.');return}
  const files=Array.from(input?.files||[]);if(!files.length){toast?.('Choose at least one file.');return}
  const service=portal.services?.clientUpload;if(!service?.uploadFilesForTask)throw new Error('Direct action uploads are unavailable. Refresh the page and try again.');
  const original=button.textContent;button.disabled=true;
  try{
    await service.uploadFilesForTask({taskId:task.id,files,note:`File for action: ${task.title}`,onProgress:({index,total})=>{button.textContent=`Uploading ${index} of ${total}…`}});
    input.value='';toast?.(files.length===1?'File uploaded to this action.':`${files.length} files uploaded to this action.`);
    window.NexusClientShell?.refresh?.({force:true});
    schedule();
  }catch(error){console.error('Direct task upload failed',error);toast?.(error.message||'The file could not be uploaded.')}finally{button.disabled=false;button.textContent=original}
}

function bindPanel(panel,task){
  panel.querySelectorAll('[data-task-file-download]').forEach(button=>{if(button.dataset.boundTaskFileDownload)return;button.dataset.boundTaskFileDownload='1';button.addEventListener('click',()=>download(button.dataset.taskFileDownload))});
  const button=panel.querySelector('[data-task-file-upload]'),input=panel.querySelector('[data-task-file-input]');
  if(button&&!button.dataset.boundTaskFileUpload){button.dataset.boundTaskFileUpload='1';button.addEventListener('click',()=>upload(task,input,button))}
  if(input&&!input.dataset.boundTaskFileInput){input.dataset.boundTaskFileInput='1';input.addEventListener('change',()=>{const span=input.closest('label')?.querySelector('span'),count=input.files?.length||0;if(span)span.textContent=count?`${count} ${count===1?'file':'files'} selected`:'Choose file(s)'})}
}

function enhanceClientTaskModal(){
  const form=document.querySelector('#nexusClientTaskModalBody #nexusClientTaskForm[data-task-id]');if(!form)return;
  const task=taskById(form.dataset.taskId);if(!task)return;
  let panel=form.querySelector(`[data-task-file-panel="${CSS.escape(String(task.id))}"]`);
  const signature=taskDocs(task).map(doc=>doc.id).join('|')+`|${task.status}|${isReadOnly()}`;
  if(!panel){panel=document.createElement('div');const actions=form.querySelector('.actions');(actions||form).insertAdjacentElement(actions?'beforebegin':'beforeend',panel)}
  if(panel.dataset.signature!==signature){panel.outerHTML=panelMarkup(task);panel=form.querySelector(`[data-task-file-panel="${CSS.escape(String(task.id))}"]`);if(panel){panel.dataset.signature=signature;bindPanel(panel,task)}}
  else bindPanel(panel,task);
}

function enhanceActionCards(){
  document.querySelectorAll('.action-v2-card[data-task-id]').forEach(card=>{
    const task=taskById(card.dataset.taskId);if(!task||String(task.assignee||'').toLowerCase()!=='client')return;
    const signature=taskDocs(task).map(doc=>doc.id).join('|')+`|${task.status}|${isReadOnly()}`;
    let panel=card.querySelector(':scope > [data-task-file-panel]');
    if(!panel){panel=document.createElement('div');const actions=card.querySelector(':scope > .action-v2-actions');(actions||card).insertAdjacentElement(actions?'beforebegin':'beforeend',panel)}
    if(panel.dataset.signature!==signature){panel.outerHTML=panelMarkup(task,{compact:true});panel=card.querySelector(':scope > [data-task-file-panel]');if(panel){panel.dataset.signature=signature;bindPanel(panel,task)}}
    else bindPanel(panel,task);
  });
}

function ensureFileTaskModal(){
  let modal=document.getElementById('nexusInlineFileTaskModal');if(modal)return modal;
  modal=document.createElement('div');modal.id='nexusInlineFileTaskModal';modal.className='nexus-client-modal nexus-inline-file-task-modal';
  modal.innerHTML='<div class="nexus-client-modal-card"><div class="nexus-client-modal-head"><div><div class="kicker">Client action</div><h2 id="nexusInlineFileTaskTitle">Provide files</h2></div><button type="button" class="nexus-client-icon-button" data-inline-file-close aria-label="Close action">×</button></div><div id="nexusInlineFileTaskBody"></div></div>';
  document.body.appendChild(modal);runtime?.modals?.register?.(modal,'inline-file-task');
  modal.querySelector('[data-inline-file-close]')?.addEventListener('click',()=>runtime?.modals?.close?.('nexusInlineFileTaskModal'));
  return modal;
}

function openFileTask(task){
  const modal=ensureFileTaskModal(),body=modal.querySelector('#nexusInlineFileTaskBody');
  modal.querySelector('#nexusInlineFileTaskTitle').textContent=task.title||'Provide files';
  body.innerHTML=`<div class="inline-file-task-instructions"><section><span>WHY THIS MATTERS</span><p>${esc(task.description||'Relystra needs this information to continue the work without guessing.')}</p></section><section><span>WHAT TO SEND OR DO</span><p>${esc(task.instructions||'Upload the requested file or files below.')}</p></section><section><span>WHAT HAPPENS NEXT</span><p>Upload the file or files here. When everything is attached, send this action to Relystra for review.</p></section></div>${panelMarkup(task)}<div class="inline-file-task-actions"><button type="button" class="btn primary" data-inline-file-submit="${esc(task.id)}">Send to Relystra for review →</button><button type="button" class="btn secondary" data-inline-file-close-bottom>Cancel</button></div>`;
  const panel=body.querySelector('[data-task-file-panel]');if(panel)bindPanel(panel,task);
  const submit=body.querySelector('[data-inline-file-submit]');
  if(submit){submit.disabled=taskDocs(task).length===0;submit.title=submit.disabled?'Upload at least one file first.':'';submit.addEventListener('click',async()=>{const current=taskById(task.id)||task;if(!taskDocs(current).length){toast?.('Upload at least one file first.');return}submit.disabled=true;submit.textContent='Sending…';try{const result=await sb.rpc('nexus_submit_task_for_review',{p_task_id:task.id,p_response_data:task.response_data||{}});if(result.error)throw result.error;toast?.('Submitted to Relystra for review.');runtime?.modals?.close?.('nexusInlineFileTaskModal');await portal.workspace?.();await window.NexusClientShell?.refresh?.({force:true})}catch(error){console.error('File action submission failed',error);toast?.(error.message||'This action could not be submitted.')}finally{submit.disabled=false;submit.textContent='Send to Relystra for review →'}})}
  body.querySelector('[data-inline-file-close-bottom]')?.addEventListener('click',()=>runtime?.modals?.close?.('nexusInlineFileTaskModal'));
  runtime?.modals?.open?.('nexusInlineFileTaskModal');
}

function interceptFileTasks(){
  if(state.admin||state.previewReadOnly===true||document.documentElement.dataset.inlineFileTaskIntercept==='1')return;
  document.documentElement.dataset.inlineFileTaskIntercept='1';
  document.addEventListener('click',event=>{
    const trigger=event.target.closest?.('[data-complete-task]');if(!trigger)return;
    const task=taskById(trigger.dataset.completeTask);if(!task||!isClientOwned(task)||!isFileTask(task))return;
    event.preventDefault();event.stopImmediatePropagation();openFileTask(task);
  },true);
}

function refresh(){scheduled=false;enhanceClientTaskModal();enhanceActionCards();interceptFileTasks()}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(refresh)}

const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('nexus:workspace-ready',schedule);window.addEventListener('nexus:client-context-ready',schedule);
document.addEventListener('click',schedule,true);
schedule();

window.NexusTaskFileAttachments=Object.freeze({refresh:schedule,openFileTask,taskDocs});
