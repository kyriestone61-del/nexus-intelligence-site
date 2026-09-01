function associateLabels(root=document){
  root.querySelectorAll('label:not([for])').forEach(label=>{
    const control=label.querySelector('input[id],select[id],textarea[id]');
    if(control?.id)label.htmlFor=control.id;
  });
}

function normalizeSemanticContracts(root=document){
  const due=root.querySelector?.('#requestDocDue')||document.getElementById('requestDocDue');
  const dueLabel=due?.closest('.field')?.querySelector('label');
  if(dueLabel){dueLabel.textContent='Due date';dueLabel.htmlFor='requestDocDue'}

  const tabSignIn=document.getElementById('tabSignIn'),tabCreate=document.getElementById('tabCreate');
  if(tabSignIn){tabSignIn.setAttribute('aria-controls','signInPane');tabSignIn.setAttribute('role','tab')}
  if(tabCreate){tabCreate.setAttribute('aria-controls','createPane');tabCreate.setAttribute('role','tab')}
  document.querySelector('.tabs')?.setAttribute('role','tablist');
}

function enhanceDialogs(root=document){
  root.querySelectorAll('.modal,.nexus-client-modal,.nexus-client-inbox-drawer,.nexus-client-guide-drawer,.portal-verified-overlay').forEach(modal=>{
    modal.setAttribute('role',modal.getAttribute('role')||'dialog');
    modal.setAttribute('aria-modal','true');
    const visible=modal.classList.contains('show')||modal.classList.contains('open');
    modal.setAttribute('aria-hidden',visible?'false':'true');
    const title=modal.querySelector('h1,h2,h3');
    if(title){
      if(!title.id)title.id=`${modal.id||'nexus-dialog'}-title`;
      modal.setAttribute('aria-labelledby',title.id);
    }
  });
}

function ensureSkipNavigation(){
  if(document.getElementById('nexusSkipLink'))return;
  const main=document.querySelector('main.main');if(!main)return;
  if(!main.id)main.id='nexusMainContent';
  main.setAttribute('tabindex','-1');
  const link=document.createElement('a');
  link.id='nexusSkipLink';link.className='nexus-skip-link';link.href=`#${main.id}`;link.textContent='Skip to main content';
  document.body.prepend(link);
  if(!document.getElementById('nexusSkipLinkStyle')){
    const style=document.createElement('style');style.id='nexusSkipLinkStyle';
    style.textContent='.nexus-skip-link{position:fixed;left:12px;top:10px;z-index:100000;transform:translateY(-160%);padding:10px 14px;border-radius:8px;background:#f4f0e8;color:#111;font-weight:800;text-decoration:none}.nexus-skip-link:focus{transform:translateY(0)}';
    document.head.appendChild(style);
  }
}

function syncDialogState(root=document){
  root.querySelectorAll('.modal,.nexus-client-modal,.nexus-client-inbox-drawer,.nexus-client-guide-drawer,.portal-verified-overlay').forEach(modal=>{
    const visible=modal.classList.contains('show')||modal.classList.contains('open');
    modal.setAttribute('aria-hidden',visible?'false':'true');
  });
}

function run(root=document){associateLabels(root);normalizeSemanticContracts(root);enhanceDialogs(root);ensureSkipNavigation();syncDialogState(root)}
run();

window.NexusAccessibility=Object.freeze({associateLabels,normalizeSemanticContracts,enhanceDialogs,ensureSkipNavigation,syncDialogState,run});
