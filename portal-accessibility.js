function associateLabels(root=document){
  root.querySelectorAll('label:not([for])').forEach(label=>{
    const control=label.querySelector('input[id],select[id],textarea[id]');
    if(control?.id)label.htmlFor=control.id;
  });
}

function enhanceDialogs(root=document){
  root.querySelectorAll('.modal').forEach(modal=>{
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    if(!modal.hasAttribute('aria-hidden'))modal.setAttribute('aria-hidden',modal.classList.contains('open')?'false':'true');
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
  const style=document.createElement('style');
  style.textContent='.nexus-skip-link{position:fixed;left:12px;top:10px;z-index:100000;transform:translateY(-160%);padding:10px 14px;border-radius:8px;background:#f4f0e8;color:#111;font-weight:800;text-decoration:none}.nexus-skip-link:focus{transform:translateY(0)}';
  document.head.appendChild(style);
}

function syncDialogState(){
  document.querySelectorAll('.modal').forEach(modal=>modal.setAttribute('aria-hidden',modal.classList.contains('open')?'false':'true'));
}

function run(){associateLabels();enhanceDialogs();ensureSkipNavigation();syncDialogState()}
run();

const observer=new MutationObserver(()=>run());
observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});

document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const open=[...document.querySelectorAll('.modal.open')].pop();
  open?.querySelector('.close')?.click();
});

window.NexusAccessibility={associateLabels,enhanceDialogs,ensureSkipNavigation,syncDialogState};
