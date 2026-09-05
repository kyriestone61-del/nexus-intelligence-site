import assert from 'node:assert/strict';
import fs from 'node:fs';

const foundation=fs.readFileSync('portal-foundation-hardening.js','utf8');
const app=fs.readFileSync('portal-app.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260831_nexus_active_engagement_terminal_guard.sql','utf8');

// Client operations must not emit the legacy denied raw Company Memory network request.
assert.match(foundation,/function createOpsClient/);
assert.match(foundation,/table==='nexus_company_memory'\?memoryNoop\(\):target\.from\(table\)/);
assert.match(foundation,/renderClientMemory/);
assert.match(foundation,/nexus_get_company_memory_client/);
assert.match(app,/NexusFoundationHardening\?\.opsClient\|\|portal\.sb/);
assert.match(app,/initOps\(\{sb:opsClient/);

// Explicit active engagement must never resolve a terminal project.
assert.match(foundation,/const terminalProject=/);
assert.match(foundation,/if\(explicit&&!terminalProject\(explicit\)\)return explicit/);
assert.match(foundation,/function openProjects\(\).*filter\(p=>!terminalProject\(p\)\)/s);

// Database is the final invariant owner on project completion/cancellation.
assert.match(migration,/nexus_reconcile_active_engagement_after_project_terminal/);
assert.match(migration,/DELETE FROM public\.nexus_active_engagements/);
assert.match(migration,/IF v_count=1/);
assert.match(migration,/CREATE TRIGGER nexus_project_terminal_reconcile_active_engagement/);
assert.match(migration,/AFTER UPDATE OF status ON public\.nexus_projects/);
assert.match(migration,/WHEN \(NEW\.status IN \('complete','cancelled'\)\)/);

console.log('Relystra Issue #48 hardening finish contracts passed.');
