// Shared private-file persistence. The document insert is the commit point;
// downstream refresh/logging failures must not delete an already-committed file.
export async function persistEvidence(sb,{file,companyId,userId,projectId=null,category='Client Source',note=null,requestId=null,requirementId=null,taskId=null,sensitivity='standard',sourceRole='client',documentArea='client_submission'}){
  if(!file||!file.size)throw new Error('Choose a non-empty file.');
  if(file.size>26214400)throw new Error('File exceeds the 25 MB limit.');
  if(!companyId||!userId)throw new Error('Sign in and choose a client workspace first.');
  const path=`${companyId}/${Date.now()}-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const bucket=sb.storage.from('nexus-client-documents');
  const uploaded=await bucket.upload(path,file,{contentType:file.type||undefined});if(uploaded.error)throw uploaded.error;
  const row={company_id:companyId,project_id:projectId,task_id:taskId,storage_path:path,file_name:file.name,mime_type:file.type||null,size_bytes:file.size,category,status:'shared',note,uploaded_by:userId,sensitivity,request_id:requestId,data_requirement_id:requirementId,document_area:documentArea,source_role:sourceRole};
  try{const result=await sb.from('nexus_documents').insert(row).select().single();if(result.error)throw result.error;return result.data}
  catch(error){try{await bucket.remove([path])}catch{}throw error}
}
