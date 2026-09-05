export class WorkspaceLoadError extends Error{
  constructor(failures=[]){
    super(`Relystra workspace could not fully load: ${failures.map(x=>x.label).join(', ')}`);
    this.name='WorkspaceLoadError';
    this.failures=failures;
  }
}

export function createWorkspaceLoadController(){
  let generation=0;
  let companyId=null;
  return {
    begin(nextCompanyId){
      generation+=1;
      companyId=nextCompanyId||null;
      return Object.freeze({generation,companyId});
    },
    isCurrent(token){
      return !!token&&token.generation===generation&&token.companyId===companyId;
    },
    current(){return Object.freeze({generation,companyId})}
  };
}

export async function collectWorkspaceQueries(entries={}){
  const labels=Object.keys(entries);
  const results=await Promise.all(labels.map(async label=>{
    try{
      const result=await entries[label];
      if(result?.error)return {label,error:result.error,data:undefined};
      return {label,error:null,data:result?.data};
    }catch(error){
      return {label,error,data:undefined};
    }
  }));
  const failures=results.filter(x=>x.error);
  if(failures.length)throw new WorkspaceLoadError(failures);
  return Object.fromEntries(results.map(x=>[x.label,x.data]));
}

export async function loadWorkspaceSnapshot({controller,companyId,queries}){
  if(!controller)throw new Error('Workspace load controller required');
  const token=controller.begin(companyId);
  const data=await collectWorkspaceQueries(queries(token));
  if(!controller.isCurrent(token))return {applied:false,stale:true,token,data:null};
  return {applied:true,stale:false,token,data};
}

export function emptyWorkspaceSnapshot(){
  return {
    projects:[],tasks:[],milestones:[],metrics:[],documents:[],notifications:[],activity:[],documentRequests:[]
  };
}

export function normalizeWorkspaceSnapshot(data={}){
  return {
    projects:Array.isArray(data.projects)?data.projects:[],
    tasks:Array.isArray(data.tasks)?data.tasks:[],
    milestones:Array.isArray(data.milestones)?data.milestones:[],
    metrics:Array.isArray(data.metrics)?data.metrics:[],
    documents:Array.isArray(data.documents)?data.documents:[],
    notifications:Array.isArray(data.notifications)?data.notifications:[],
    activity:Array.isArray(data.activity)?data.activity:[],
    documentRequests:Array.isArray(data.documentRequests)?data.documentRequests:[]
  };
}

export function describeWorkspaceLoadError(error){
  if(!(error instanceof WorkspaceLoadError))return 'Relystra could not load this workspace. Refresh and try again.';
  const labels=error.failures.map(x=>x.label);
  return `Relystra could not load ${labels.join(', ')}. The workspace was not treated as empty. Refresh and try again.`;
}
