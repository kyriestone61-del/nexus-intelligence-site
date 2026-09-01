/**
 * Client upload service: one owner for the visible Client Shell upload form.
 * It prevents the hidden legacy upload handler from competing in client mode.
 */
const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable for upload service.');
const {sb,state,runtime,toast}=portal;
const {events,boundary}=runtime;
const BUCKET='nexus-client-documents';
let selection={requestId:null,requirementId:null,title:''};
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function clear(){selection={requestId:null,requirementId:null,title:''};const box=$('uploadContext');if(box){box.classList.remove('show');box.innerHTML=''}}
function prepare({requestId=null,requirementId=null,title=''}){
  selection={requestId,requirementId,title:String(title||'')};
  const box=$('uploadContext');if(!box)return;
  box.classList.add('show');box.innerHTML=`<b>Upload for:</b> ${esc(selection.title||'General evidence')} <button id="clientClearUploadContext" class="btn secondary" type="button">Clear</button>`;
  if($('docNote')&&!$('docNote').value)$('docNote').value=selection.title?`Evidence for ${selection.title}`:'';
  events.bind($('clientClearUploadContext'),'click','client-upload:clear',clear);
}

async function submit(event){
  event.preventDefault();event.stopImmediatePropagation();
  const form=event.currentTarget,file=$('docFile')?.files?.[0];if(!file)return;
  if(file.size>26214400){toast('File exceeds the 25 MB limit.');return}
  const companyId=state.companyId;if(!companyId)throw new Error('Client company context is unavailable.');
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${companyId}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
  const request=state.docRequests?.find(row=>row.id===selection.requestId),requirement=state.dataRequirements?.find(row=>row.id===selection.requirementId);
  const sensitivity=request?.sensitivity||requirement?.catalog?.sensitivity||'standard';
  const upload=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type||undefined});if(upload.error)throw upload.error;
  try{
    const row={company_id:companyId,project_id:state.projects?.[0]?.id||null,storage_path:path,file_name:file.name,mime_type:file.type||null,size_bytes:file.size,category:$('docCategory')?.value||'Client Source',status:'shared',note:$('docNote')?.value.trim()||null,uploaded_by:state.user.id,sensitivity,request_id:selection.requestId||null,data_requirement_id:selection.requirementId||null,document_area:'client_submission',source_role:'client'};
    const insert=await sb.from('nexus_documents').insert(row).select().single();if(insert.error)throw insert.error;
    await portal.log?.('document_uploaded','document',insert.data.id,`Client uploaded ${file.name}`);
    form.reset();clear();toast('Document uploaded securely.');await portal.workspace?.();
  }catch(error){try{await sb.storage.from(BUCKET).remove([path])}catch(rollbackError){console.warn('Nexus upload rollback failed',rollbackError)}throw error}
}

const form=$('uploadForm');if(form)events.bind(form,'submit','client-upload:submit',boundary.wrap('client secure upload',submit),true);
const service=Object.freeze({prepare,clear,getSelection:()=>({...selection})});
portal.services=portal.services||{};portal.services.clientUpload=service;
Object.defineProperty(portal,'prepareUpload',{value:prepare,configurable:true,enumerable:false});
window.NexusClientUploadService=service;
