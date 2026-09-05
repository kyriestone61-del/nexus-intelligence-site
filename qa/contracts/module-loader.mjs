export class RequiredModuleLoadError extends Error{
  constructor(moduleId,cause){
    super(`Required Relystra module failed to load: ${moduleId}`);
    this.name='RequiredModuleLoadError';
    this.code='REQUIRED_MODULE_LOAD_FAILED';
    this.moduleId=moduleId;
    this.cause=cause;
  }
}

export function buildAdminModulePlan({providerConfigured=true}={}){
  return [
    {id:'admin-intake',url:'portal-admin-intake.js',required:true},
    {id:'diagnosis-view',url:'portal-diagnosis-v2.js',required:true},
    {id:'admin-journey',url:'portal-admin-journey.js',required:true},
    {id:'journey-router',url:'portal-admin-journey-router.js',required:true},
    {id:'diagnosis-controller',url:'portal-diagnosis-controller.js',required:true},
    {id:'journey-task-guard',url:'portal-journey-task-guard.js',required:true},
    // When the automated provider is unavailable, manual fallback is part of the
    // core diagnosis path and therefore cannot be treated as optional.
    {id:'diagnosis-manual-fallback',url:'portal-diagnosis-manual-fallback.js',required:!providerConfigured},
    {id:'diagnosis-recovery',url:'portal-diagnosis-recovery.js',required:false},
    {id:'diagnosis-review-ux',url:'portal-diagnosis-review-ux.js',required:false}
  ];
}

export function buildSharedModulePlan(){
  return [
    {id:'action-workflow',url:'portal-action-workflow.js',required:true},
    {id:'action-execution',url:'portal-action-execution-v2.js',required:true},
    {id:'action-forms',url:'portal-action-execution-v2-forms.js',required:true},
    {id:'guided-ops',url:'portal-guided-ops.js',required:false}
  ];
}

export async function loadModulePlan(plan,{importer}={}){
  if(typeof importer!=='function')throw new Error('Module importer required');
  const loaded=new Map();
  const optionalFailures=[];
  for(const item of plan||[]){
    try{
      const module=await importer(item.url,item);
      if(!module&&item.required)throw new Error('Importer returned no module');
      loaded.set(item.id,module||null);
    }catch(error){
      if(item.required)throw new RequiredModuleLoadError(item.id,error);
      optionalFailures.push({id:item.id,url:item.url,error});
      loaded.set(item.id,null);
    }
  }
  return {loaded,optionalFailures};
}

export function requiredModuleIds(plan=[]){return plan.filter(x=>x.required).map(x=>x.id)}

export function assertWorkspaceReady({plan,result}){
  const missing=requiredModuleIds(plan).filter(id=>!result?.loaded?.get(id));
  if(missing.length){
    const error=new Error(`Relystra workspace is missing required modules: ${missing.join(', ')}`);
    error.code='WORKSPACE_REQUIRED_MODULES_MISSING';
    error.missing=missing;
    throw error;
  }
  return true;
}
