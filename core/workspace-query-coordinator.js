export function createWorkspaceQueryCoordinator(){
  const inFlight=new Map();
  const generations=new Map();

  function generation(key){return generations.get(String(key))||0}
  function invalidate(key){
    const token=String(key);
    generations.set(token,generation(token)+1);
  }
  function invalidateAll(){
    for(const key of new Set([...generations.keys(),...inFlight.keys()]))invalidate(key);
  }
  function run(key,loader,{force=false}={}){
    if(typeof loader!=='function')throw new Error('Workspace loader must be a function.');
    const token=String(key);
    const currentGeneration=generation(token);
    const existing=inFlight.get(token);
    if(!force&&existing&&existing.generation===currentGeneration)return existing.promise;

    const promise=Promise.resolve().then(loader);
    const record={generation:currentGeneration,promise};
    inFlight.set(token,record);
    promise.finally(()=>{
      if(inFlight.get(token)===record)inFlight.delete(token);
    }).catch(()=>{});
    return promise;
  }

  return Object.freeze({
    run,
    invalidate,
    invalidateAll,
    has:key=>inFlight.has(String(key)),
    generation:key=>generation(key)
  });
}
