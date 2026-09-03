const SIMPLE_COPY=new Map([
  ['Use one private workspace to prepare for discovery, exchange evidence, see responsibilities, make approvals, follow implementation, and measure what changed.','Use this private workspace to see what Nexus needs from you, upload files, answer questions, approve decisions, follow the work as it moves forward, and see the results.'],
  ['Your ordered actions and decisions.','See what you need to do next and any decisions waiting for you.'],
  ['Exactly what Nexus needs and why.','See exactly what files or information Nexus needs, why we need them, and where to upload them.'],
  ['Baseline → change → measured result.','See where things started, what changed, and what results were measured.'],
  ['Authenticated workspace','Private workspace'],
  ['Creating an account opens a coordination workspace. It does not by itself create a consulting engagement, fee, deadline, or service level.','Creating an account opens your private Nexus workspace. It does not start paid work or create a deadline unless you have a separate agreement with Nexus that says so.'],
  ['Tell Nexus which company this workspace belongs to.','Tell us which company this account is for.'],
  ['Once you continue, Nexus will create your initial opportunity-assessment preparation checklist and next actions automatically.','After you continue, Nexus will create your first checklist and show you what to do next.'],
  ['Evidence preparation + private exchange','Files and information'],
  ['Give Nexus enough evidence to understand the real operation. Perfect documentation is not required.','Share enough real information for Nexus to understand how your business works today. Your documents do not need to be perfect.'],
  ['Nexus is looking for evidence of how the work actually happens: the process, real examples, systems involved, volume, measurable baseline, and the people who own decisions. For every item below, we explain why it matters, where to find it, and what to do if it does not exist.','Nexus needs enough real information to understand how work gets done today. This may include a few normal examples, the tools you use, how often the work happens, the current results, and who makes decisions. For each request below, we explain why we need it, where you can find it, and what to do if you do not have it.'],
  ['Use representative—not exhaustive—evidence.','A few normal examples are usually enough.'],
  ['Three to ten normal examples usually teach more than a giant data dump.','A few typical examples are usually more helpful than a huge export.'],
  ['Redact what Nexus does not need.','Remove sensitive information Nexus does not need.'],
  ['Remove unnecessary customer PII, secrets, credentials, payment information, and unrelated sensitive fields.','Remove customer details, passwords, payment information, and other sensitive information that Nexus does not need.'],
  ['Missing is useful information.','It is okay if something does not exist.'],
  ['If an SOP, KPI, systems map, or runbook does not exist, choose “Build with Nexus.” That gap can become part of the work.','If a process document, report, system map, or checklist does not exist, tell Nexus. We can help you create what is needed.'],
  ['Recommended evidence for this service','Information that will help Nexus understand your business'],
  ['Use this for current-state evidence or a specific Nexus request. Select an item above first when possible so the portal can automatically mark the correct requirement as uploaded.','Upload a file that shows how your business works today, or a file Nexus specifically asked for. If you can, choose the matching request first so Nexus knows what the file is for.'],
  ['Context note','About this file'],
  ['Private company-level storage.','Stored privately for your company.'],
  ['Responsibility queue','Your work and Nexus work'],
  ['Who owns the next move, what “done” means, and where work is blocked.','See what you need to do, what Nexus is working on, and what is waiting on another step.'],
  ['Engagement progress','Project progress'],
  ['Portal dates are planning dates unless a signed agreement expressly identifies a binding deadline or service level.','Dates shown here are planning dates unless your signed agreement says a date is a binding deadline.'],
  ['Value & Improvement Ledger','Results'],
  ['Action routing','Updates'],
  ['Keep responsibilities visible without turning the workspace into notification noise.','Keep important tasks and updates in one place without unnecessary alerts.'],
  ['Audit trail','History'],
  ['Why Nexus Needs It','Why this matters'],
  ['What You Need to Provide','What to send or answer'],
  ['What Happens Afterward','What happens next'],
  ['Nexus working','Nexus is working'],
  ['Important boundaries','Good to know'],
  ['Portal tasks and planning dates coordinate work; they do not amend signed scope, fees, acceptance criteria, or service levels.','Tasks and dates in this workspace help organize the work. They do not change your signed agreement, price, or service terms.'],
  ['How to prepare files safely','How to upload files safely'],
  ['Use representative evidence.','Use a few normal examples.'],
  ['A few normal examples usually beat a giant export.','A few normal examples are usually more helpful than a huge export.'],
  ['Redact unrelated sensitive data.','Remove sensitive information Nexus does not need.'],
  ['Never share passwords, MFA codes, API keys, full card data, SSNs, or medical information.','Do not upload passwords, login codes, API keys, full card numbers, Social Security numbers, or medical information.'],
  ['Missing is valid.','It is okay if you do not have something.'],
  ['If something does not exist, tell Nexus rather than creating a fake document.','If something does not exist, tell Nexus. Do not create a document just to fill the request.'],
  ['Examples + redaction','Examples + what to remove'],
  ['Redact:','Remove before uploading:'],
  ['Select a request above when possible, then upload the smallest useful file.','If the file answers a request above, choose that request first. Then upload the smallest file that clearly shows what Nexus needs.'],
  ['No dependency-blocked actions.','Nothing is waiting on another step.'],
  ['Measured improvement','Measured results'],
  ['Baseline','Starting point'],
  ['Target','Goal'],
  ['Measured results appear after a baseline and follow-up exist.','Results will appear after Nexus records a starting point and measures it again later.'],
  ['Released findings.','Reports Nexus has shared with you.'],
  ['Internal drafts remain private until Nexus releases a client-safe report.','Draft reports stay private until Nexus finishes reviewing them and shares one with you.'],
  ['Client action','Your task'],
  ['Nexus needs this to move forward without guessing.','Nexus needs this information so we can move forward with the right understanding.'],
  ['Submit the answer, decision, or completion context Nexus needs.','Give Nexus the answer, decision, or details requested here.'],
  ['Security boundary','Keep login information private'],
  ['Do not enter passwords, MFA codes, API keys, or recovery codes.','Do not enter passwords, login codes, API keys, or recovery codes here.'],
  ['Ask in plain language.','Ask Nexus a question.'],
  ['Upload only requested representative evidence.','Upload only the files or information Nexus asks for. A few normal examples are usually enough.'],
  ['Tell Nexus it does not exist; do not manufacture one.','Tell Nexus you do not have it. Do not create a file just to complete the request.'],
  ['A prerequisite is still incomplete, so the task is intentionally unavailable.','Another step must be finished first. Nexus will let you know when this one is ready.'],
  ['Open the requested item, review examples and redaction guidance, then upload the smallest representative file.','Open the request, look at the examples and what should be removed, then upload the smallest file that clearly answers the request.'],
  ['Released findings are in Reports.','Reports Nexus has shared with you are in Reports.'],
  ['Internal drafts stay private.','Draft reports stay private until they are ready.'],
  ['I do not have a confident workspace answer for that.','I do not have a reliable answer for that from your workspace.'],
  ['Contact Nexus rather than relying on a guess.','Contact Nexus so we can answer instead of guessing.'],
  ['Provide the requested representative evidence in Files. Redact anything Nexus does not need.','Upload the files Nexus asked for in the Secure Data Room. Remove any sensitive information that is not needed.'],
  ['Review the decision, confirm the allowed boundary, and submit your response.','Review the decision, confirm what you are approving, and send your response.'],
  ['Confirm the approved access boundary. Never place passwords, MFA codes, API keys, or secrets in a Nexus response.','Confirm what access Nexus is allowed to have. Do not send passwords, login codes, API keys, or other secrets.'],
  ['State the business decision clearly so Nexus does not infer it from incomplete context.','State your decision clearly so Nexus does not have to guess.'],
  ['Complete the requested action and submit any context Nexus needs to review it.','Complete the task and include any details Nexus needs to review it.'],
  ['Nexus will review your submission and advance the engagement to the next controlled step.','Nexus will review what you sent and then open the next step.'],
  ['Nexus will update the workspace when the next step becomes available.','Nexus will update your workspace when the next step is ready.'],
  ['Why Nexus needs it','Why this matters'],
  ['How to find it','Where to find it'],
  ['Good examples','Examples'],
  ['A representative example is enough.','One normal example is enough.'],
  ['That is okay. Nexus can help build the minimum useful version with you.','That is okay. Nexus can help you create a simple version that is good enough to move forward.'],
  ['Preparation workspace','What Nexus needs from you'],
  ['Do the work here.','Complete these items here.'],
  ['Answer preparation items, upload existing evidence, choose Build with Nexus when an artifact does not exist, or mark an item Not applicable. You do not need separate permission to work through client-owned items.','Answer the questions, upload files you already have, tell Nexus when something does not exist, or mark an item if it does not apply to your business. You can complete anything assigned to you without waiting for extra permission.'],
  ['CLIENT → NEXUS HANDOFF','WHEN YOU ARE FINISHED'],
  ['Ready to send this step back to Nexus.','Everything in this step is ready. Send it to Nexus for review.'],
  ['Finish the preparation items above before handing this step back.','Finish the items above before sending this step to Nexus.'],
  ['When you have provided the requested work for this action, submit it to Nexus.','When you have finished what Nexus asked for, send this step to Nexus for review.'],
  ['Nexus confirms scope or access boundaries only when the next controlled step requires it.','Nexus will review what you sent. If the next step needs your approval for scope or access, we will ask you first.']
]);

const DYNAMIC_RULES=[
  [/^(\d+) of (\d+) preparation items addressed\.?$/i,'$1 of $2 items completed.'],
  [/^Address (\d+) more item$/i,'Complete $1 more item'],
  [/^Address (\d+) more items$/i,'Complete $1 more items'],
  [/^Available after Nexus completes “(.+)”\.$/i,'This will be ready after Nexus finishes “$1”.'],
  [/^Available after Nexus completes (.+)\.$/i,'This will be ready after Nexus finishes $1.']
];

let observer=null;
let scheduled=false;

function replaceText(root){
  if(!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
    const parent=node.parentElement;
    if(!parent||['SCRIPT','STYLE','TEXTAREA','INPUT','OPTION'].includes(parent.tagName))return NodeFilter.FILTER_REJECT;
    const value=String(node.nodeValue||'').trim();
    if(!value)return NodeFilter.FILTER_REJECT;
    if(SIMPLE_COPY.has(value)||DYNAMIC_RULES.some(([pattern])=>pattern.test(value)))return NodeFilter.FILTER_ACCEPT;
    return NodeFilter.FILTER_REJECT;
  }});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
    const raw=String(node.nodeValue||'');
    const value=raw.trim();
    let next=SIMPLE_COPY.get(value)||null;
    if(!next){for(const [pattern,replacement] of DYNAMIC_RULES){pattern.lastIndex=0;if(pattern.test(value)){next=value.replace(pattern,replacement);break}}}
    if(next&&next!==value)node.nodeValue=raw.replace(value,next);
  }
}

function rewriteAuthAndOnboarding(){
  replaceText(document.getElementById('authView'));
  replaceText(document.getElementById('onboardView'));
  const security=[...document.querySelectorAll('#authView .note')].find(node=>/Security boundary:/i.test(node.textContent||''));
  if(security)security.innerHTML='<b>Keep sensitive information private:</b> Never upload passwords, login codes, API keys, full card numbers, medical records, or other highly sensitive information unless Nexus specifically asks for it and tells you how to send it safely.';
}

function rewriteLegacyClientCopy(){
  if(!document.body.classList.contains('portal-client-mode'))return;
  replaceText(document.getElementById('portalApp'));
  const scope=[...document.querySelectorAll('#section-tasks .note')].find(node=>/Scope rule:/i.test(node.textContent||''));
  if(scope)scope.innerHTML='<b>Good to know:</b> Creating or assigning a task here only helps organize work that is already agreed. It does not add new paid work or create a contract deadline.';
  const measurement=[...document.querySelectorAll('#section-metrics .note')].find(node=>/Measurement rule:/i.test(node.textContent||''));
  if(measurement)measurement.innerHTML='<b>How results are measured:</b> A number improving does not automatically mean Nexus caused it. We track where the number started, when it was measured, what changed, and anything else that could have affected the result.';
  const control=[...document.querySelectorAll('.sidebar .note')].find(node=>/Control boundary:/i.test(node.textContent||''));
  if(control)control.innerHTML='<b>Good to know:</b> Tasks, comments, files, dates, and status labels in this workspace help organize the work. They do not change your signed agreement, price, or service terms.';
  const note=document.getElementById('docNote');if(note)note.placeholder='What is this file, and what does it help Nexus understand?';
}

function rewriteClientShellCopy(){
  if(!document.body.classList.contains('portal-client-mode'))return;
  for(const id of ['nexus-client-today','nexus-client-files','nexus-client-improvement','nexus-client-reports','nexusClientTaskModal','nexusClientApprovalModal','nexusClientInboxDrawer','nexusClientGuideDrawer'])replaceText(document.getElementById(id));
  document.querySelectorAll('[data-prep-upload]').forEach(button=>{button.textContent='Upload file'});
  document.querySelectorAll('[data-prep-build]').forEach(button=>{button.textContent='I do not have this — help me build it'});
  document.querySelectorAll('[data-prep-na]').forEach(button=>{button.textContent='This does not apply'});
  document.querySelectorAll('[data-prep-answer]').forEach(panel=>{const input=panel.querySelector('textarea');if(input)input.placeholder='A short, clear answer is enough. Add details only if they help Nexus understand.'});
  const guide=document.getElementById('nexusClientGuideInput');if(guide)guide.placeholder='Ask Nexus a question…';
}

function applyPlainLanguage(){
  observer?.disconnect();
  try{
    rewriteAuthAndOnboarding();
    rewriteLegacyClientCopy();
    rewriteClientShellCopy();
  }finally{
    observer?.observe(document.body,{childList:true,subtree:true});
  }
}

function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;applyPlainLanguage()})}

observer=new MutationObserver(schedule);
observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('nexus:client-context-ready',schedule);
window.addEventListener('nexus:workspace-ready',schedule);
window.addEventListener('nexus:diagnosis-changed',schedule);
applyPlainLanguage();

window.NexusClientPlainLanguage=Object.freeze({apply:applyPlainLanguage,__qa:{SIMPLE_COPY,DYNAMIC_RULES}});
