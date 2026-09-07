// Deliberately narrow model output. Administrator review supplies final commercial terms.
export function recommendationFindings(run: {id:string;analysis_result:Record<string,unknown>}) {
  return ['opportunity_backlog','bottlenecks','root_causes','claims'].flatMap(key =>
    (Array.isArray(run.analysis_result[key]) ? run.analysis_result[key] as unknown[] : []).map((snapshot,index) =>
      ({source_path:`${key}/${index}`,diagnosis_run_id:run.id,snapshot})));
}

export function buildRecommendationPayload(result: unknown, findings: Array<{source_path:string}>,
  templates: Array<{code:string}>, inputs: Array<{id:string}>) {
  if (!result || typeof result !== 'object' || !Array.isArray((result as {builds?:unknown}).builds)) throw new Error('INVALID_BUILD_RECOMMENDATIONS');
  const builds = (result as {builds:Record<string,unknown>[]}).builds;
  if (builds.length>25) throw new Error('BUILD_RECOMMENDATION_LIMIT');
  const seen=new Set<string>();
  return builds.map(spec => {
    if (!spec || typeof spec !== 'object' || typeof spec.name!=='string' || !spec.name.trim() || typeof spec.outcome!=='string' || !spec.outcome.trim()
      || !findings.some(f=>f.source_path===spec.source_path) || !templates.some(t=>t.code===spec.template_code)
      || !Array.isArray(spec.completed_action_ids) || spec.completed_action_ids.some(id=>!inputs.some(i=>i.id===id))) throw new Error('UNSUPPORTED_BUILD_RECOMMENDATION');
    const key=`${spec.source_path}:${spec.template_code}`;
    if(seen.has(key))throw new Error('DUPLICATE_BUILD_RECOMMENDATION');seen.add(key);
    const strings=(value:unknown) => Array.isArray(value) ? value.filter((v):v is string=>typeof v==='string').map(v=>v.slice(0,3000)).slice(0,30) : [];
    return {name:spec.name.trim().slice(0,250),outcome:spec.outcome.trim().slice(0,6000),problem:String(spec.problem||'').slice(0,6000),
      template_code:spec.template_code,source_path:spec.source_path,completed_action_ids:spec.completed_action_ids,
      scope_in:strings(spec.scope_in),scope_out:strings(spec.scope_out),required_inputs:strings(spec.required_inputs),
      acceptance_criteria:strings(spec.acceptance_criteria),assumptions:strings(spec.assumptions),risks:strings(spec.risks),
      priority:['high','medium','low'].includes(String(spec.priority)) ? spec.priority : 'medium',
      priority_reason:String(spec.priority_reason||'').slice(0,3000),dependencies:[]};
  });
}
