import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('portal-app.js','utf8');
const execution=fs.readFileSync('portal-client-action-execution.js','utf8');
const upload=fs.readFileSync('portal-client-upload-service.js','utf8');
const base=fs.readFileSync('portal-client.js','utf8');

assert.match(app,/portal-client-action-execution\.js/,'client execution controller must be loaded');
assert.ok(app.indexOf('portal-client-shell-v2.js')<app.indexOf('portal-client-action-execution.js'),'execution controller must load after the client shell so it can reconcile the shell without replacing it');
assert.match(app,/^const BUILD='[0-9]{8}-[A-Za-z0-9._-]+';/m,'client assets must use a cache-busting build id');
assert.match(app,/portal-client-action-execution\.js\?v=\$\{BUILD\}/,'client execution controller must use the shared cache-busting build id');

assert.match(execution,/sb\.rpc\('nexus_submit_task_for_review'/,'client submission must use the secured handoff RPC');
assert.match(execution,/event\.stopImmediatePropagation\(\)/,'controller must stop the obsolete direct-update submit handler');
assert.match(execution,/document\.addEventListener\('submit',[\s\S]*?,true\)/,'task submission interception must run in capture phase');
assert.match(execution,/status:'in_progress'/,'client must be able to save work without handing ownership to Nexus');
assert.match(execution,/Save progress/,'structured client work must support draft progress');
assert.match(execution,/Submitted to Nexus\. This step is now in Nexus review\./,'handoff must make ownership transfer explicit');

assert.match(execution,/nexus_project_data_requirements/,'preparation responses must persist to the canonical preparation table');
assert.match(execution,/data-prep-upload/,'preparation workspace must expose direct upload');
assert.match(execution,/portal\.prepareUpload/,'preparation upload must delegate to the canonical upload service');
assert.match(execution,/Answer here/,'preparation workspace must support in-app answers');
assert.match(execution,/Build with Nexus/,'missing artifacts must be routable to Nexus');
assert.match(execution,/Not applicable/,'client must be able to explicitly resolve non-applicable items');
assert.match(execution,/data-submit-file-task/,'file/preparation work must have an explicit Client → Nexus handoff');
assert.match(execution,/After you submit/,'Today view must explain what follows client submission');
assert.match(execution,/Nexus reviews your submission/,'Today view must not imply the client needs Nexus permission before doing client-owned work');
assert.equal(execution.includes('new MutationObserver'),false,'direct-work reconciliation must not add DOM rewrite loops');

assert.match(execution,/state\.previewReadOnly===true/,'administrator Client View must be detected explicitly');
assert.match(execution,/function requireWritable\(\)/,'all direct mutations must have an explicit writable guard');
assert.match(execution,/Client View is read-only from the administrator account/,'preview safety must explain the authorization boundary');
assert.match(execution,/Client can submit to Nexus/,'admin preview must show the real client capability without enabling the mutation');
assert.match(execution,/signed-in client can use the controls below, save progress, upload and download files, and submit completed work to Nexus/,'preview must explain what the actual client can do');

assert.match(upload,/BUCKET='nexus-client-documents'/);
assert.match(upload,/\.upload\(path,file/,'client upload service must write to private company storage');
assert.match(upload,/request_id:selection\.requestId/,'uploads must retain document-request lineage');
assert.match(upload,/data_requirement_id:selection\.requirementId/,'uploads must retain preparation-item lineage');
assert.match(upload,/document_area:'client_submission'/);
assert.match(upload,/source_role:'client'/);
assert.match(base,/createSignedUrl\(doc\.storage_path,120,\{download:doc\.file_name\}\)/,'client download must use a short-lived signed URL');
assert.match(base,/storage\.from\(BUCKET\)\.download\(doc\.storage_path\)/,'download must retain the authenticated fallback path');

console.log('NEXUS DIRECT CLIENT WORKFLOW + HANDOFF QAQC PASS');
