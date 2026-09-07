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

export function companyPreparationQuery(query, projectId = null) {
  return projectId ? query.or(`project_id.is.null,project_id.eq.${projectId}`) : query.is('project_id', null);
}
