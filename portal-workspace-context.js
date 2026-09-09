// Shared context rules. Company-level preparation remains valid without a paid project.
export const terminalProject = project => ['complete', 'completed', 'cancelled', 'canceled', 'archived'].includes(String(project?.status || '').toLowerCase());

export function selectActiveProject(projects = [], companyId, explicitId = null) {
  const rows = projects.filter(project => project.company_id === companyId && !terminalProject(project));
  const explicit = rows.find(project => project.id === explicitId);
  if (explicit) return explicit;
  const paid = rows.filter(project => project.paid_at && project.activated_at);
  paid.sort((a, b) => Date.parse(b.activated_at) - Date.parse(a.activated_at) || a.id.localeCompare(b.id));
  if (paid.length) return paid[0];
  // Existing engagements remain accessible; never infer which legacy project is current.
  return null;
}

export function workspaceUrl(href, companyId, projectId = null) {
  const url = new URL(href);
  const changed = url.searchParams.get('company') !== companyId;
  url.searchParams.set('company', companyId);
  if (projectId) url.searchParams.set('project', projectId);
  else url.searchParams.delete('project');
  // Object deep links are only meaningful in the company in which they originated.
  if (changed) for (const key of ['task', 'action', 'report', 'run', 'release', 'decision']) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function workspaceSourceDiagnosisId(state, projectId = null) {
  const projects = state?.projects || [];
  const selected = projects.find(project => project.company_id === state?.companyId && project.id === projectId)
    || projects.find(project => project.company_id === state?.companyId && project.id === state?.activeProjectId);
  return selected?.context_diagnosis_run_id || selected?.diagnosis_context_id || selected?.source_diagnosis_run_id || null;
}

export function diagnosisPreparationProjectIds(run, projectId = null) {
  return [...new Set([
    projectId,
    run?.project_id,
    run?.analysis_packet?.project?.id,
  ].filter(Boolean))];
}

export function diagnosisDocumentIds(run) {
  return new Set([
    ...(Array.isArray(run?.supporting_document_ids) ? run.supporting_document_ids : []),
    ...(run?.transcript_document_id ? [run.transcript_document_id] : []),
  ]);
}

export function preparationDocuments(state, projectId = null, run = null) {
  const sourceIds = diagnosisDocumentIds(run);
  return (state?.docs || []).filter(document => document.company_id === state?.companyId
    && (!document.project_id || document.project_id === projectId || sourceIds.has(document.id)));
}

export function companyPreparationQuery(query, projectId = null, relatedProjectIds = []) {
  const ids = [...new Set([projectId, ...relatedProjectIds].filter(Boolean))];
  return ids.length ? query.or(`project_id.is.null,${ids.map(id => `project_id.eq.${id}`).join(',')}`) : query.is('project_id', null);
}
