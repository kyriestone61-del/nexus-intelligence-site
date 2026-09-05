const $=id=>document.getElementById(id);
let scheduled=false;

function isAdmin(){
  const role=[
    $('roleLabel')?.textContent||'',
    $('opsRoleChip')?.textContent||'',
    $('accountModeBadge')?.textContent||''
  ].join(' ');
  return /administrator|nexus admin/i.test(role);
}
function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}
function setHtml(el,html){if(el&&el.innerHTML!==html)el.innerHTML=html}
function navLabel(section,label){const b=document.querySelector(`.side-nav button[data-section="${section}"]`);if(b)setText(b,label)}

function ensureRoleGuide(admin){
  const main=document.querySelector('.main');if(!main)return;
  let guide=$('portalRoleGuide');
  if(!guide){guide=document.createElement('div');guide.id='portalRoleGuide';guide.className='portal-role-guide';main.prepend(guide)}
  const html=admin
    ? '<b>ADMIN ACCOUNT · YOU RUN THE ENGAGEMENT</b><span>Review client requests, assign actions, request approvals, manage automations and projects, record improvements, and request files or information.</span>'
    : '<b>CLIENT ACCOUNT · KEEP IT SIMPLE</b><span>Your workspace answers four questions: What does Relystra need from me? What do I need to decide? What is Relystra doing? What changed in my business?</span>';
  setHtml(guide,html);
}
function simplifyNavigation(admin){
  if(admin){
    navLabel('command','Command Center');navLabel('clients','Clients');navLabel('overview','Client Today');navLabel('tasks','Action Items');navLabel('requests','Client Requests');navLabel('approvals','Approvals to Send');navLabel('automations','Automations');navLabel('metrics','Improvements');navLabel('timeline','Projects');navLabel('documents','Files & Information');navLabel('activity','Activity');
  }else{
    navLabel('overview','Today');navLabel('requests','Ask Relystra');navLabel('approvals','Decisions');navLabel('tasks','My Actions');navLabel('automations','Systems');navLabel('metrics','Results');navLabel('timeline','Delivery Plan');navLabel('documents','Files & Information');navLabel('notifications','Alerts');
  }
}

function groupClientNavigation(admin){
  const nav=document.querySelector('.side-nav');if(!nav)return;
  const existing=$('portalClientNavGroups');
  if(admin){
    if(existing){
      existing.querySelectorAll('button[data-section]').forEach(b=>nav.appendChild(b));
      existing.remove();
    }
    const activity=nav.querySelector('button[data-section="activity"]');if(activity)activity.style.display='';
    return;
  }
  if(existing)return;
  const bySection=s=>nav.querySelector(`button[data-section="${s}"]`);
  const groups=[
    ['Today',['overview']],
    ['Work With Relystra',['tasks','approvals','requests']],
    ['Project',['timeline','automations']],
    ['Files & Information',['documents']],
    ['Results',['metrics','notifications']]
  ];
  const shell=document.createElement('div');shell.id='portalClientNavGroups';shell.className='portal-client-nav-groups';
  groups.forEach(([label,sections])=>{
    const group=document.createElement('div');group.className='portal-client-nav-group';
    const heading=document.createElement('div');heading.className='portal-client-nav-heading';heading.textContent=label;group.appendChild(heading);
    sections.forEach(section=>{const b=bySection(section);if(b)group.appendChild(b)});
    shell.appendChild(group);
  });
  const activity=bySection('activity');if(activity)activity.style.display='none';
  nav.prepend(shell);
}
function simplifyControls(admin){
  const taskBtn=$('newTaskBtn');if(taskBtn){taskBtn.style.display=admin?'inline-flex':'none';if(admin)setText(taskBtn,'+ Assign action')}
  const metricBtn=$('newMetricBtn');if(metricBtn){metricBtn.style.display=admin?'inline-flex':'none';if(admin)setText(metricBtn,'+ Record measurement')}
  const milestoneBtn=$('newMilestoneBtn');if(milestoneBtn){milestoneBtn.style.display=admin?'inline-flex':'none';if(admin)setText(milestoneBtn,'+ Add milestone')}
  const docRequestBtn=$('newDocumentRequestBtn');if(docRequestBtn){docRequestBtn.style.display=admin?'inline-flex':'none';if(admin)setText(docRequestBtn,'+ Request file / info')}
  const requestBtn=$('toggleRequestForm');if(requestBtn&&admin)setText(requestBtn,'+ Log client request');
  const approvalBtn=$('toggleApprovalForm');if(approvalBtn&&admin)setText(approvalBtn,'+ Send approval to client');
  const autoBtn=$('toggleAutomationForm');if(autoBtn&&admin)setText(autoBtn,'+ Register automation');

  if(!admin){
    document.querySelectorAll('#taskList .row,#overviewTasks .row').forEach(row=>{
      const assignee=(row.querySelector('.pill')?.textContent||'').trim().toLowerCase();
      const select=row.querySelector('select.task-status');
      if(select&&assignee==='nexus'){
        const chip=document.createElement('span');chip.className='portal-managed-chip';chip.textContent='Managed by Relystra';select.replaceWith(chip);
      }
    });
  }
}
function simplifySectionCopy(admin){
  const taskSection=$('section-tasks');
  if(taskSection){const p=taskSection.querySelector('.toolbar .small');if(p)setText(p,admin?'Assign work to Relystra or the client. The owner is responsible for moving the action forward.':'These are the actions Relystra has assigned to you. Update only your own actions as you work through them.')}
  const metricSection=$('section-metrics');if(metricSection){const h=metricSection.querySelector('h1');if(h)setText(h,admin?'Improvements & Results':'Results')}
  const timeline=$('section-timeline');if(timeline){const h=timeline.querySelector('h1');if(h)setText(h,admin?'Projects & Milestones':'Your Delivery Plan')}
}
function simplifyDataRoom(admin){
  const section=$('section-documents');if(!section)return;
  const h1=section.querySelector('.toolbar h1');if(h1)setText(h1,'Files & Information');
  const intro=section.querySelector('.toolbar p.small');
  if(intro)setText(intro,admin?'Request, review, and download the information needed to diagnose and deliver the engagement.':'Use this simple checklist to give Relystra what it needs. Provide what you already have; if something does not exist, choose Build with Relystra.');

  const hero=section.querySelector('.data-room-hero');
  if(hero){
    const kicker=hero.querySelector('.kicker');if(kicker)setText(kicker,admin?'Client preparation':'Start here');
    const h2=hero.querySelector('h2');if(h2)setText(h2,admin?'What does Relystra still need from this client?':'What does Relystra need from you?');
    const p=hero.querySelector('p');
    if(p)setHtml(p,admin
      ? 'Use the checklist below to see what has been provided, what is still missing, and where Relystra should help build the missing operating artifact.'
      : 'For each item, choose one action: <b>Upload</b>, <b>Answer here</b>, <b>Build with Relystra</b>, or <b>Not applicable</b>. That is all you need to do.');
  }

  const help=section.querySelector('.data-room-help');
  if(help&&!admin)setHtml(help,'<div><b>Do not overthink it.</b><span>A few normal examples are usually better than a giant data dump.</span></div><div><b>Do not have something?</b><span>Choose “Build with Relystra.” Missing documentation is not a failure; Relystra can help create the minimum useful version.</span></div>');


  if(!admin){
    const friendlyTitles={
      'Current workflow or SOP':'How this work is done today',
      'Representative examples of the work':'3–10 real examples',
      'Systems and tools list':'Tools your team uses',
      'Volume and frequency':'How often this happens',
      'Existing KPI or performance report':'Any reports or numbers you already track',
      'Process owners and decision makers':'Who does the work and who approves changes'
    };
    section.querySelectorAll('.requirement-card').forEach(card=>{
      const title=[...card.querySelectorAll('h2,h3,h4,b')].find(el=>friendlyTitles[(el.textContent||'').trim()]);
      if(title)setText(title,friendlyTitles[(title.textContent||'').trim()]);
    });
  }

  const prepSection=[...section.querySelectorAll('.secure-doc-section')].find(x=>x.querySelector('#dataRoomRequirements'));
  if(prepSection){const h=prepSection.querySelector('h2');if(h)setText(h,admin?'Preparation checklist':'What Relystra needs from you');const k=prepSection.querySelector('.kicker');if(k)setText(k,admin?'Preparation checklist':'Step 1')}

  const requestSection=[...section.querySelectorAll('.secure-doc-section')].find(x=>x.querySelector('#explicitDocumentRequests'));
  if(requestSection){
    const h=requestSection.querySelector('h2');if(h)setText(h,admin?'Specific client requests':'Additional requests from Relystra');
    const k=requestSection.querySelector('.kicker');if(k)setText(k,admin?'Specific requests':'Only if needed');
    const rr=$('explicitDocumentRequests');requestSection.style.display=!admin&&rr&&/No additional one-off document requests are outstanding/i.test(rr.textContent||'')?'none':'block';
  }

  const upload=section.querySelector('.data-room-upload');
  if(upload){
    const k=upload.querySelector('.kicker');if(k)setText(k,admin?'Private upload':'Step 2');
    const h=upload.querySelector('h2');if(h)setText(h,admin?'Share a file securely':'Upload a file');
    const p=upload.querySelector('p.small');if(p)setText(p,admin?'Attach evidence to a checklist item or specific client request whenever possible.':'Select a checklist item above first when possible, then upload the file here. Add a short note only if Relystra may not know what the file is.');
    const cat=$('docCategory')?.closest('.field');if(cat)cat.style.display=admin?'block':'none';if(!admin&&$('docCategory'))$('docCategory').value='Client Source';
    const noteLabel=$('docNote')?.closest('.field')?.querySelector('label');if(noteLabel&&!admin)setHtml(noteLabel,'What is this file? <span class="small">(optional)</span>');
  }

  const filesSection=[...section.querySelectorAll('.secure-doc-section')].find(x=>x.querySelector('#documentList'));
  if(filesSection){const h=filesSection.querySelector('h2');if(h)setText(h,admin?'Workspace files':'Files already shared');const k=filesSection.querySelector('.kicker');if(k)setText(k,admin?'Workspace record':'Step 3')}
}
function apply(){
  scheduled=false;
  const app=$('portalApp');if(!app||getComputedStyle(app).display==='none')return;
  const admin=isAdmin();
  document.body.classList.toggle('portal-admin-mode',admin);
  document.body.classList.toggle('portal-client-mode',!admin);
  ensureRoleGuide(admin);simplifyNavigation(admin);groupClientNavigation(admin);simplifyControls(admin);simplifySectionCopy(admin);simplifyDataRoom(admin);
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(apply)}
function reapplySoon(){schedule();setTimeout(schedule,180);setTimeout(schedule,700)}

// Controlled refreshes only. Do not observe our own DOM mutations.
window.addEventListener('load',reapplySoon);
document.addEventListener('click',reapplySoon,true);
document.addEventListener('change',reapplySoon,true);
document.addEventListener('submit',reapplySoon,true);
setInterval(schedule,1200);
setTimeout(schedule,100);setTimeout(schedule,500);setTimeout(schedule,1200);
