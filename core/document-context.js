function findById(rows,id){
  if(!id)return null;
  return (Array.isArray(rows)?rows:[]).find(row=>String(row?.id)===String(id))||null;
}

function requireSelected(rows,id,label){
  if(!id)return null;
  const row=findById(rows,id);
  if(!row)throw new Error(`${label} could not be found in the current workspace.`);
  return row;
}

function assertCompany(row,companyId,label){
  if(!row)return;
  if(row.company_id&&String(row.company_id)!==String(companyId)){
    throw new Error(`${label} is outside the current company workspace.`);
  }
}

/**
 * Resolve the only valid document lineage context before any storage write.
 *
 * Context is owned by the selected task/request/requirement. Project array order
 * is never used as a fallback. If no project-bound record is selected, the
 * upload remains company-level (`projectId: null`).
 */
export function resolveDocumentContext({
  companyId,
  projects=[],
  tasks=[],
  docRequests=[],
  dataRequirements=[],
  taskId=null,
  requestId=null,
  requirementId=null
}={}){
  if(!companyId)throw new Error('Client company context is unavailable.');

  const task=requireSelected(tasks,taskId,'Selected action');
  const request=requireSelected(docRequests,requestId,'Selected document request');
  const requirement=requireSelected(dataRequirements,requirementId,'Selected data requirement');

  assertCompany(task,companyId,'Selected action');
  assertCompany(request,companyId,'Selected document request');
  assertCompany(requirement,companyId,'Selected data requirement');

  const projectIds=[task?.project_id,request?.project_id,requirement?.project_id]
    .filter(Boolean)
    .map(String);
  const uniqueProjectIds=[...new Set(projectIds)];

  if(uniqueProjectIds.length>1){
    throw new Error('Selected upload context refers to multiple projects. Choose files for one project at a time.');
  }

  const projectId=uniqueProjectIds[0]||null;
  let project=null;
  if(projectId){
    project=findById(projects,projectId);
    if(!project)throw new Error('The project for this upload could not be found in the current workspace.');
    assertCompany(project,companyId,'Selected project');
  }

  return Object.freeze({
    companyId:String(companyId),
    projectId,
    project,
    task,
    request,
    requirement
  });
}
