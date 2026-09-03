const TERMINAL_STATUSES=new Set(['complete','completed','cancelled','canceled','archived','closed']);

function terminal(project){return TERMINAL_STATUSES.has(String(project?.status||'').trim().toLowerCase())}
function findProject(projects,id){return id?(Array.isArray(projects)?projects:[]).find(project=>String(project?.id)===String(id))||null:null}
function assertProjectCompany(project,companyId,label='Project'){
  if(project?.company_id&&String(project.company_id)!==String(companyId))throw new Error(`${label} is outside the current company workspace.`);
}

/**
 * Canonical product-level engagement context.
 *
 * Order in the projects array is never authoritative. The explicit
 * nexus_active_engagements pointer wins. A single non-terminal project is a
 * bounded compatibility fallback. Multiple non-terminal projects without an
 * explicit pointer are intentionally ambiguous and must not be guessed.
 */
export function resolveEngagementContext({companyId,projects=[],activeEngagement=null}={}){
  if(!companyId)throw new Error('Company context is unavailable.');
  const companyProjects=(Array.isArray(projects)?projects:[]).filter(project=>{
    assertProjectCompany(project,companyId,'Workspace project');
    return true;
  });
  const openProjects=companyProjects.filter(project=>!terminal(project));
  const openProjectIds=openProjects.map(project=>String(project.id));

  if(activeEngagement){
    if(activeEngagement.company_id&&String(activeEngagement.company_id)!==String(companyId)){
      throw new Error('Active engagement is outside the current company workspace.');
    }
    const activeProject=findProject(companyProjects,activeEngagement.project_id);
    if(!activeProject)throw new Error('Active engagement project could not be found in the current workspace.');
    if(terminal(activeProject))throw new Error('Active engagement points to a terminal project and must be reconciled before continuing.');
    return Object.freeze({
      companyId:String(companyId),
      activeProjectId:String(activeProject.id),
      activeProject,
      openProjectIds:Object.freeze(openProjectIds),
      ambiguous:false,
      source:'explicit'
    });
  }

  if(openProjects.length===1){
    const activeProject=openProjects[0];
    return Object.freeze({
      companyId:String(companyId),
      activeProjectId:String(activeProject.id),
      activeProject,
      openProjectIds:Object.freeze(openProjectIds),
      ambiguous:false,
      source:'single_open_project'
    });
  }

  if(openProjects.length===0){
    return Object.freeze({
      companyId:String(companyId),
      activeProjectId:null,
      activeProject:null,
      openProjectIds:Object.freeze([]),
      ambiguous:false,
      source:'none'
    });
  }

  return Object.freeze({
    companyId:String(companyId),
    activeProjectId:null,
    activeProject:null,
    openProjectIds:Object.freeze(openProjectIds),
    ambiguous:true,
    source:'ambiguous'
  });
}

export function requireActiveProject(context){
  if(context?.activeProject)return context.activeProject;
  if(context?.ambiguous)throw new Error('Multiple open projects exist and no active engagement is selected. Nexus will not guess which project owns this action.');
  throw new Error('No active engagement is available for this action.');
}

export function isTerminalProject(project){return terminal(project)}
