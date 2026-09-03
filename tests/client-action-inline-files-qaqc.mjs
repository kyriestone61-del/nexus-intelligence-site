import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('portal-app.js','utf8');
const upload=fs.readFileSync('portal-client-upload-service.js','utf8');
const documents=fs.readFileSync('core/document-service.js','utf8');
const files=fs.readFileSync('portal-task-file-attachments.js','utf8');
const live=fs.readFileSync('portal-task-file-attachments-live.js','utf8');
const css=fs.readFileSync('portal-task-file-attachments.css','utf8');
const forms=fs.readFileSync('portal-action-execution-v2-forms.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260903_nexus_task_document_attachments.sql','utf8');
const guard=fs.readFileSync('supabase/migrations/20260903_nexus_task_document_company_guard.sql','utf8');

assert.match(app,/^const BUILD='[0-9]{8}-[A-Za-z0-9._-]+';/m,'client assets must use a fresh cache-busting portal build id');

// The client module is now UI/facade only; canonical persistence lives in DocumentService.
assert.match(upload,/createDocumentService|services\.documents/,'client upload facade must use canonical DocumentService');
assert.match(upload,/uploadFilesForTask/,'upload facade must expose multi-file action uploads');
assert.match(upload,/documents\.uploadFilesForTask/,'task attachment batching must delegate to canonical DocumentService');
assert.match(upload,/documentArea:'client_submission'/,'client facade must retain the client submission boundary');
assert.match(upload,/sourceRole:'client'/,'client facade must retain client provenance');
assert.match(upload,/enforceClientTask:true/,'task attachment facade must enforce client-owned action boundaries');
assert.match(upload,/portal\.workspace\?\.\(\)/,'form submission must refresh canonical workspace state once complete');
assert.doesNotMatch(upload,/from\('nexus_documents'\)/,'client upload facade must not insert document metadata directly');
assert.doesNotMatch(upload,/\.storage\.from\([^)]*\)\.upload/,'client upload facade must not own storage writes');

assert.match(documents,/DEFAULT_MAX_DOCUMENT_BYTES=26214400/,'canonical DocumentService must retain the existing 25 MB limit');
assert.match(documents,/task_id:task\?\.id\|\|null/,'DocumentService must persist task lineage');
assert.match(documents,/category:'Action Attachment'/,'DocumentService must categorize task uploads as action attachments');
assert.match(documents,/document_area:documentArea/,'DocumentService must persist document-area boundaries');
assert.match(documents,/source_role:sourceRole/,'DocumentService must persist source provenance');
assert.match(documents,/remove\(\[path\]\)/,'DocumentService must own rollback');

assert.match(files,/FILES FOR THIS ACTION/,'client action must visibly own its file section');
assert.match(files,/data-task-file-input/,'client action must expose an inline file picker');
assert.match(files,/multiple accept=/,'inline picker must support multiple approved file types');
assert.match(files,/data-task-file-upload/,'client action must expose a direct upload control');
assert.match(files,/data-task-file-download/,'attached files must be downloadable from the same action');
assert.match(files,/portal\.downloadDocument/,'downloads must use the canonical download facade');
assert.match(files,/nexus_submit_task_for_review/,'file actions must be submittable from the same action flow');
assert.match(files,/event\.stopImmediatePropagation\(\)/,'file tasks must intercept the old redirect-to-Data-Room behavior');
assert.match(files,/state\.previewReadOnly===true\|\|state\.admin===true/,'administrator preview must remain read-only for client uploads');
assert.match(files,/The client can upload files directly to this action from their account/,'admin Client Work view must explain the real client capability');
assert.match(live,/Upload at least one file first/,'file-task submit must stay disabled until an attachment exists');

assert.match(css,/font-size:17px!important/,'mobile action instructions must be materially larger');
assert.match(css,/\.action-v2-head\{display:grid!important/,'mobile action header must stack to prevent vertical Details text');
assert.match(css,/writing-mode:horizontal-tb!important/,'Details control must stay horizontal on mobile');
assert.match(css,/\.task-file-uploader\{display:grid/,'inline upload UI must have a dedicated responsive layout');
assert.match(css,/\.inline-file-task-instructions p\{font-size:18px/,'dedicated mobile file-action instructions must be easy to read');

assert.match(forms,/portal-task-file-attachments\.js/,'admin Client Work must load attachment controls');
assert.match(upload,/portal-task-file-attachments\.js/,'actual client shell must load attachment controls');
assert.match(forms,/portal-task-file-attachments\.css/,'admin Client Work must load attachment styles');
assert.match(upload,/portal-task-file-attachments\.css/,'actual client shell must load attachment styles');

assert.match(migration,/add column if not exists task_id uuid references public\.nexus_tasks\(id\)/,'documents must support durable task lineage');
assert.match(migration,/nexus_documents_task_id_idx/,'task attachment lookup must be indexed');
assert.match(guard,/nexus_validate_document_task_company/,'task attachment lineage must enforce same-company integrity');
assert.match(guard,/t\.company_id = new\.company_id/,'cross-company task attachment references must be rejected');

for(const source of [upload,documents,files,live])assert.equal(/service[_-]?role|SUPABASE_SERVICE|RESEND_API_KEY|TWILIO_AUTH_TOKEN|SECRET_KEY/.test(source),false,'client-delivered attachment code must not contain privileged credentials');

console.log('NEXUS CLIENT ACTION INLINE FILES QAQC PASS');
