(function(){
  const path=location.pathname.replace(/\/$/,'')||'/';
  if(path!=='/')return;

  const detail={
    manual:{title:'Reduce repetitive work',text:'Nexus maps repetitive handoffs, copying, routing, document preparation, and status-update work, then evaluates which steps are appropriate for automation.',examine:['Manual data entry and copying','Recurring document work','Routing, reminders, and status updates'],measure:['Handling time','Manual touchpoints','Rework and exception rate']},
    service:{title:'Improve customer response',text:'Nexus maps intake, triage, scheduling, response preparation, and exception routing, then designs a controlled workflow where the business case supports it.',examine:['Inquiry classification','Scheduling and intake','Response preparation and escalations'],measure:['Response time','Resolution time','Exception volume']},
    knowledge:{title:'Organize company knowledge',text:'Nexus organizes approved SOPs, policies, project information, and internal documents into a retrieval workflow with defined access and review boundaries.',examine:['SOP and policy retrieval','Document search','Internal knowledge assistance'],measure:['Search time','Repeat questions','Successful retrieval rate']},
    systems:{title:'Connect disconnected systems',text:'Nexus maps how information moves between email, spreadsheets, CRMs, documents, and operating systems, then evaluates which handoffs can be connected safely.',examine:['Cross-system handoffs','Duplicate data entry','Status synchronization'],measure:['Handoff time','Duplicate entry volume','Sync and exception rate']}
  };

  const buttons=[...document.querySelectorAll('.problem-btn')];
  const title=document.getElementById('problemTitle');
  const text=document.getElementById('problemText');
  const examine=document.getElementById('problemList');
  const measure=document.getElementById('measureList');
  if(!buttons.length||!title||!text||!examine||!measure)return;

  const render=key=>{
    const item=detail[key]||detail.manual;
    title.textContent=item.title;
    text.textContent=item.text;
    examine.innerHTML=item.examine.map(x=>`<li>${x}</li>`).join('');
    measure.innerHTML=item.measure.map(x=>`<li>${x}</li>`).join('');
    buttons.forEach(button=>{
      const active=button.dataset.problem===key;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
  };

  buttons.forEach(button=>button.addEventListener('click',()=>render(button.dataset.problem)));
  render(buttons.find(button=>button.classList.contains('active'))?.dataset.problem||'manual');
})();
