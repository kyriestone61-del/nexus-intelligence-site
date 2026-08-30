const $=id=>document.getElementById(id);
let scheduled=false;

function isAdmin(){
  const role=($('roleLabel')?.textContent||'')+' '+($('opsRoleChip')?.textContent||'');
  return /administrator|nexus admin/i.test(role);
}
function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}
function navLabel(section,label){const b=document.querySelector(`.side-nav button[data-section="${section}"]`);if(b)setText(b,label)}
function ensureRoleGuide(admin){
  const main=document.querySelector('.main');if(!main)return;
  let guide=$('portalRoleGuide');
  if(!guide){guide=document.createElement('div');guide.id='portalRoleGuide';guide.className='portal-role-guide';main.prepend(guide)}
  guide.innerHTML=admin
    ? '<b>Admin mode</b><span>You run the engagement: review client requests, assign actions, request approvals, manage automations and projects, record improvements, and request files.</span>'
    : '<b>Your job in this workspace</b><span>Provide requested information, complete actions assigned to you, ask Nexus for help or changes, and make approval decisions. Nexus manages the delivery system.</span>';
}
function simplifyNavigation(admin){
  if(admin){
    navLabel('command','Command Center');
    navLabel('clients','Clients');
    navLabel('overview','Client Today');
    navLabel('tasks','Action Items');
    navLabel('requests','Client Requests');
    navLabel('approvals','Approvals to Send');
    navLabel('automations','Automations');
    navLabel('metrics','Improvements');
    navLabel('timeline','Projects');
    navLabel('documents','Files & Information');
    navLabel('activity','Activity');
  }else{
    navLabel('overview','Today');
    navLabel('requests','Ask Nexus');
    navLabel('approvals','Decisions');
    navLabel('tasks','My Actions');
    navLabel('automations','Systems');
    navLabel('metrics','Results');
    navLabel('timeline','Delivery Plan');
    navLabel('documents','Files & Information');
    navLabel('notifications','Alerts');
  }
}
function simplifyControls(admin){
  const taskBtn=$('newTaskBtn');if(taskBtn){taskBtn.style.display=admin?'inline-flex':'none';if(admin)setText(taskBtn,'+ Assign action')}
  const metricBtn=$('newMetricBtn');if(metricBtn){metricBtn.style.display=admin?'inline-flex':'none';if(admin)setText(metricBtn,'+ Record measurement')}
  const milestoneBtn=$('newMilestoneBtn');if(milestoneBtn&&admin)setText(milestoneBtn,'+ Add milestone');
  const docRequestBtn=$('newDocumentRequestBtn');if(docRequestBtn&&admin)setText(docRequestBtn,'+ Request file / info');
  const requestBtn=$('toggleRequestForm');if(requestBtn&&admin)setText(requestBtn,'+ Log client request');
  const approvalBtn=$('toggleApprovalForm');if(approvalBtn&&admin)setText(approvalBtn,'+ Send approval to client');
  const autoBtn=$('toggleAutomationForm');if(autoBtn&&admin)setText(autoBtn,'+ Register automation');

  if(!admin){
    document.querySelectorAll('#taskList .row,#overviewTasks .row').forEach(row=>{
      const assignee=(row.querySelector('.pill')?.textContent||'').trim().toLowerCase();
      const select=row.querySelector('select.task-status');
      if(select&&assignee==='nexus'){
        const chip=document.createElement('span');chip.className='portal-managed-chip';chip.textContent='Managed by Nexus';select.replaceWith(chip);
      }
    });
  }
}
function simplifySectionCopy(admin){
  const taskSection=$('section-tasks');
  if(taskSection){
    const p=taskSection.querySelector('.toolbar .small');
    if(p)setText(p,admin?'Assign work to Nexus or the client. The owner is responsible for moving the action forward.':'These are the actions Nexus has assigned to you. Update only your own actions as you work through them.');
  }
  const metricSection=$('section-metrics');
  if(metricSection){
    const h=metricSection.querySelector('h1');if(h)setText(h,admin?'Improvements & Results':'Results');
  }
  const timeline=$('section-timeline');
  if(timeline){const h=timeline.querySelector('h1');if(h)setText(h,admin?'Projects & Milestones':'Your Delivery Plan')}
}
function simplifyDataRoom(admin){
  const section=$('section-documents');if(!section)return;
  const h1=section.querySelector('.toolbar h1');if(h1)setText(h1,admin?'Files & Information':'Files & Information');
  const intro=section.querySelector('.toolbar p.small');
  if(intro)setText(intro,admin?'Request, review, and download the information needed to diagnose and deliver the engagement.':'This page has one job: show you what Nexus needs and give you a simple place to provide it.');

  const hero=section.querySelector('.data-room-hero');
  if(hero){
    const kicker=hero.querySelector('.kicker');if(kicker)setText(kicker,admin?'Client preparation':'Start here');
    const h2=hero.querySelector('h2');if(h2)setText(h2,admin?'What does Nexus still need from this client?':'What does Nexus need from you?');
    const p=hero.querySelector('p');if(p)p.innerHTML=admin
      ? 'Use the checklist below to see what has been provided, what is still missing, and where Nexus should help build the missing operating artifact.'
      : 'Work down the checklist. For each item, <b>upload it</b>, <b>answer in the portal</b>, choose <b>Build with Nexus</b>, or mark it <b>Not applicable</b>. You do not need perfect documentation.';
  }

  const help=section.querySelector('.data-room-help');
  if(help&&!admin)help.innerHTML='<div><b>Do not overthink it.</b><span>A few normal examples are usually better than a giant data dump.</span></div><div><b>Do not have something?</b><span>Choose “Build with Nexus.” Missing documentation is not a failure; Nexus can help create the minimum useful version.</span></div>';

  const prepSection=[...section.querySelectorAll('.secure-doc-section')].find(x=>x.querySelector('#dataRoomRequirements'));
  if(prepSection){const h=prepSection.querySelector('h2');if(h)setText(h,admin?'Preparation checklist':'What Nexus needs from you');const k=prepSection.querySelector('.kicker');if(k)setText(k,admin?'Preparation checklist':'Step 1')}

  const requestSection=[...section.querySelectorAll('.secure-doc-section')].find(x=>x.querySelector('#explicitDocumentRequests'));
  if(requestSection){
    const h=requestSection.querySelector('h2');if(h)setText(h,admin?'Specific client requests':'Additional requests from Nexus');
    const k=requestSection.querySelector('.kicker');if(k)setText(k,admin?'Specific requests':'Only if needed');
    const rr=$('explicitDocumentRequests');if(!admin&&rr&&/No additional one-off document requests are outstanding/i.test(rr.textContent||''))requestSection.style.display='none';else requestSection.style.display='block';
  }

  const upload=section.querySelector('.data-room-upload');
  if(upload){
    const k=upload.querySelector('.kicker');if(k)setText(k,admin?'Private upload':'Step 2');
    const h=upload.querySelector('h2');if(h)setText(h,admin?'Share a file securely':'Upload a file');
    const p=upload.querySelector('p.small');if(p)setText(p,admin?'Attach evidence to a checklist item or specific client request whenever possible.':'Select a checklist item above first when possible, then upload the file here. Add a short note only if Nexus may not know what the file is.');
    const cat=$('docCategory')?.closest('.field');if(cat)cat.style.display=admin?'block':'none';if(!admin&&$('docCategory'))$('docCategory').value='Client Source';
    const noteLabel=$('docNote')?.closest('.field')?.querySelector('label');if(noteLabel&&!admin)noteLabel.innerHTML='What is this file? <span class="small">(optional)</span>';
  }

  const filesSection=[...section.querySelectorAll('.secure-doc-section')].find(x=>x.querySelector('#documentList'));
  if(filesSection){const h=filesSection.querySelector('h2');if(h)setText(h,admin?'Workspace files':'Files already shared');const k=filesSection.querySelector('.kicker');if(k)setText(k,admin?'Workspace record':'Step 3')}
}
function apply(){
  scheduled=false;
  if(!$('portalApp')||getComputedStyle($('portalApp')).display==='none')return;
  const admin=isAdmin();
  document.body.classList.toggle('portal-admin-mode',admin);
  document.body.classList.toggle('portal-client-mode',!admin);
  ensureRoleGuide(admin);simplifyNavigation(admin);simplifyControls(admin);simplifySectionCopy(admin);simplifyDataRoom(admin);
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(apply)}
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});
window.addEventListener('load',schedule);
setTimeout(schedule,250);setTimeout(schedule,1000);
