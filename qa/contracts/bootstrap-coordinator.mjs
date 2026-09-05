export const BOOT_PHASES=Object.freeze([
  'created','auth_resolved','company_resolved','operations_loaded','role_modules_loaded','workspace_ready','revealed'
]);

const NEXT=Object.freeze({
  created:'auth_resolved',
  auth_resolved:'company_resolved',
  company_resolved:'operations_loaded',
  operations_loaded:'role_modules_loaded',
  role_modules_loaded:'workspace_ready',
  workspace_ready:'revealed',
  revealed:null
});

export class BootstrapStateError extends Error{
  constructor(message,details={}){
    super(message);
    this.name='BootstrapStateError';
    this.code='INVALID_BOOT_STATE';
    Object.assign(this,details);
  }
}

export function createBootstrapCoordinator(){
  let phase='created';
  const completed=new Set();
  const context={};
  return {
    phase(){return phase},
    context(){return Object.freeze({...context})},
    complete(step,value=true){
      context[step]=value;
      const satisfied=value!==false&&value!==null&&value!==undefined;
      if(satisfied)completed.add(step);else completed.delete(step);
      return this;
    },
    has(step){return completed.has(step)},
    advance(next,{requires=[]}={}){
      if(NEXT[phase]!==next)throw new BootstrapStateError(`Illegal Relystra boot transition: ${phase} → ${next}`,{from:phase,to:next});
      const missing=requires.filter(step=>!completed.has(step));
      if(missing.length)throw new BootstrapStateError(`Relystra boot prerequisites missing: ${missing.join(', ')}`,{from:phase,to:next,missing});
      phase=next;
      return phase;
    },
    canReveal(){return phase==='workspace_ready'&&completed.has('role_navigation')&&completed.has('workspace_data')&&completed.has('required_modules')},
    reveal(){
      if(!this.canReveal())throw new BootstrapStateError('Relystra workspace cannot reveal before role navigation, workspace data, and required modules are ready.');
      phase='revealed';
      return phase;
    }
  };
}

export async function runBootstrap({resolveAuth,resolveCompany,loadOperations,loadRoleModules,loadWorkspace,onReveal}){
  const boot=createBootstrapCoordinator();
  const auth=await resolveAuth();
  boot.complete('auth',auth).advance('auth_resolved',{requires:['auth']});
  const company=await resolveCompany(auth);
  boot.complete('company',company).advance('company_resolved',{requires:['company']});
  const operations=await loadOperations({auth,company});
  boot.complete('operations',operations).advance('operations_loaded',{requires:['operations']});
  const roleModules=await loadRoleModules({auth,company,operations});
  boot.complete('required_modules',roleModules).advance('role_modules_loaded',{requires:['required_modules']});
  const workspace=await loadWorkspace({auth,company,operations,roleModules});
  boot.complete('workspace_data',workspace);
  boot.complete('role_navigation',workspace?.roleNavigationReady===true);
  boot.advance('workspace_ready',{requires:['workspace_data','role_navigation','required_modules']});
  boot.reveal();
  await onReveal?.({auth,company,operations,roleModules,workspace});
  return {boot,auth,company,operations,roleModules,workspace};
}
