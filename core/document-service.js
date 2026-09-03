import {resolveDocumentContext} from './document-context.js';

export const DEFAULT_DOCUMENT_BUCKET='nexus-client-documents';
export const DEFAULT_MAX_DOCUMENT_BYTES=26214400;

function safeFileName(name){return String(name||'file').replace(/[^a-zA-Z0-9._-]/g,'_')}
function findById(rows,id){return id?(Array.isArray(rows)?rows:[]).find(row=>String(row?.id)===String(id))||null:null}

/**
 * Canonical browser-side document service.
 *
 * Owns document lineage validation, storage persistence, metadata insertion,
 * rollback, batching, and secure download-target generation. UI modules may
 * prepare upload context and render controls, but must not duplicate these writes.
 */
export function createDocumentService({
  sb,
  state,
  bucket=DEFAULT_DOCUMENT_BUCKET,
  maxBytes=DEFAULT_MAX_DOCUMENT_BYTES,
  log=null,
  refresh=null,
  now=()=>Date.now(),
  uuid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`
}={}){
  if(!sb)throw new Error('Nexus document data client is unavailable.');
  if(!state)throw new Error('Nexus document state is unavailable.');

  function contextFor({taskId=null,requestId=null,requirementId=null}={}){
    return resolveDocumentContext({
      companyId:state.companyId,
      projects:state.projects||[],
      tasks:state.tasks||[],
      docRequests:state.docRequests||[],
      dataRequirements:state.dataRequirements||[],
      taskId,
      requestId,
      requirementId
    });
  }

  function assertTaskBoundary(task,{enforceClientTask=false}={}){
    if(!task||!enforceClientTask)return;
    if(String(task.assignee||'').toLowerCase()!=='client')throw new Error('Files can only be attached here for a client-owned action.');
  }

  async function uploadFile({
    file,
    requestId=null,
    requirementId=null,
    taskId=null,
    title='',
    category='Client Source',
    note=null,
    refreshAfter=true,
    sourceRole='client',
    documentArea='client_submission',
    enforceClientTask=false
  }={}){
    if(!file)throw new Error('Choose a file first.');
    if(Number(file.size||0)>maxBytes)throw new Error('File exceeds the 25 MB limit.');
    if(!state.companyId)throw new Error('Client company context is unavailable.');
    if(!state.user?.id)throw new Error('Authenticated user context is unavailable.');

    // Resolve all lineage BEFORE any bytes are written.
    const context=contextFor({taskId,requestId,requirementId});
    assertTaskBoundary(context.task,{enforceClientTask});
    const {companyId,projectId,task,request,requirement}=context;
    const path=`${companyId}/${now()}-${uuid()}-${safeFileName(file.name)}`;
    const sensitivity=request?.sensitivity||requirement?.catalog?.sensitivity||'standard';

    const upload=await sb.storage.from(bucket).upload(path,file,{contentType:file.type||undefined});
    if(upload.error)throw upload.error;

    try{
      const row={
        company_id:companyId,
        project_id:projectId,
        task_id:task?.id||null,
        storage_path:path,
        file_name:file.name,
        mime_type:file.type||null,
        size_bytes:file.size,
        category,
        status:'shared',
        note:(note||title)?String(note||`File for ${title}`):null,
        uploaded_by:state.user.id,
        sensitivity,
        request_id:requestId||null,
        data_requirement_id:requirementId||null,
        document_area:documentArea,
        source_role:sourceRole
      };
      const insert=await sb.from('nexus_documents').insert(row).select().single();
      if(insert.error)throw insert.error;
      try{await log?.('document_uploaded','document',insert.data.id,task?`${sourceRole==='nexus'?'Nexus':'Client'} uploaded ${file.name} for action: ${task.title}`:`${sourceRole==='nexus'?'Nexus':'Client'} uploaded ${file.name}`)}catch(error){console.warn('Nexus document audit log failed',error)}
      if(refreshAfter)await refresh?.();
      return insert.data;
    }catch(error){
      try{await sb.storage.from(bucket).remove([path])}catch(rollbackError){console.warn('Nexus document rollback failed',rollbackError)}
      throw error;
    }
  }

  async function uploadFilesForTask({taskId,files,note=null,onProgress=null,sourceRole='client',documentArea='client_submission',enforceClientTask=true}={}){
    const task=findById(state.tasks,taskId);
    if(!task)throw new Error('This action could not be found.');
    const list=Array.from(files||[]).filter(Boolean);
    if(!list.length)throw new Error('Choose at least one file.');
    const uploaded=[];
    for(let index=0;index<list.length;index+=1){
      onProgress?.({index:index+1,total:list.length,file:list[index]});
      uploaded.push(await uploadFile({file:list[index],taskId:task.id,title:task.title,category:'Action Attachment',note,refreshAfter:false,sourceRole,documentArea,enforceClientTask}));
    }
    await refresh?.();
    return uploaded;
  }

  function documentFor(id){return findById(state.docs,id)}

  async function createDownloadTarget(id,{expiresIn=120}={}){
    const record=documentFor(id);
    if(!record)throw new Error('Document record not found.');
    const storage=sb.storage.from(bucket);
    const signed=await storage.createSignedUrl(record.storage_path,expiresIn,{download:record.file_name});
    if(!signed.error&&signed.data?.signedUrl)return Object.freeze({kind:'signed_url',url:signed.data.signedUrl,fileName:record.file_name,record});
    const fallback=await storage.download(record.storage_path);
    if(fallback.error)throw fallback.error;
    return Object.freeze({kind:'blob',blob:fallback.data,fileName:record.file_name,record});
  }

  return Object.freeze({contextFor,uploadFile,uploadFilesForTask,documentFor,createDownloadTarget,bucket,maxBytes});
}
