import{S,$,$$,go}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=core.js';

const STUDENT_PRIMARY=[
 {label:'Today',view:'dashboard'},
 {label:'Learn',view:'academy'},
 {label:'Practice',view:'labs'},
 {label:'My Path',view:'personalize'}
];

function ensureSkipLink(){if(document.querySelector('.skip-link'))return;const a=document.createElement('a');a.className='skip-link';a.href='#mainContent';a.textContent='Skip to main content';document.body.prepend(a)}
function ensureMainId(){const main=document.querySelector('main.main');if(main&&!main.id)main.id='mainContent';if(main)main.setAttribute('tabindex','-1')}
function simplifyNav(){const nav=$('#nav');if(!nav||nav.dataset.simplified==='true')return;nav.dataset.simplified='true';nav.setAttribute('aria-label','Primary navigation');
 const ownerBlock=S.owner?`<div class="nav-owner"><div class="nav-section-label">Private Studio</div><button data-view="nexus">Nexus Intelligence</button><button data-view="statecraft">Statecraft</button><button data-view="career">Career</button><button data-view="trading">Trading</button></div>`:'';
 nav.innerHTML=`<div class="simple-nav">${STUDENT_PRIMARY.map((x,i)=>`<button data-view="${x.view}" ${i===0?'class="active" aria-current="page"':''}>${x.label}</button>`).join('')}<div class="nav-divider"></div><button data-view="tutor" class="nav-secondary">AI Tutor</button><button data-view="quiz" class="nav-secondary">Check What You Know</button><button data-view="missions" class="nav-secondary">Missions</button>${ownerBlock}<div class="nav-divider"></div><button data-view="account" class="nav-secondary">Account</button></div>`;
 nav.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{go(b.dataset.view);closeMobileNav()});
}
function setCurrentNav(id){$$('#nav [data-view]').forEach(b=>{const on=b.dataset.view===id;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')})}
function enhanceStatus(){const toast=$('#toast');if(toast){toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');toast.setAttribute('aria-atomic','true')}
 $$('.progress').forEach(p=>{if(!p.hasAttribute('role')){const w=p.firstElementChild?.style?.width||'0%';const n=parseInt(w)||0;p.setAttribute('role','progressbar');p.setAttribute('aria-valuemin','0');p.setAttribute('aria-valuemax','100');p.setAttribute('aria-valuenow',String(n))}})}
function enhanceForms(){document.querySelectorAll('input,select,textarea').forEach(el=>{if(!el.id)return;const label=document.querySelector(`label[for="${el.id}"]`);if(label)return;const wrap=el.closest('.field');const l=wrap?.querySelector('label');if(l&&!l.htmlFor)l.htmlFor=el.id});document.querySelectorAll('button').forEach(b=>{if(!b.type)b.type='button'})}
function ensureMobile(){let bar=document.querySelector('.mobile-bar');const shell=$('#appShell');const sidebar=document.querySelector('.sidebar');if(!shell||!sidebar)return;
 if(!bar){bar=document.createElement('div');bar.className='mobile-bar';bar.innerHTML='<button id="mobileMenu" class="icon-btn" aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar">☰</button><div class="mobile-brand"><b>Human OS</b><span id="mobileView">Today</span></div><button data-view="tutor" class="btn primary compact">Tutor</button>';shell.insertBefore(bar,shell.firstChild)}
 sidebar.id='sidebar';let backdrop=$('#mobileBackdrop');if(!backdrop){backdrop=document.createElement('div');backdrop.id='mobileBackdrop';backdrop.className='mobile-backdrop hidden';shell.appendChild(backdrop)}
 const menu=$('#mobileMenu');if(menu)menu.onclick=()=>{const open=document.body.classList.toggle('nav-open');menu.setAttribute('aria-expanded',String(open));backdrop.classList.toggle('hidden',!open)};backdrop.onclick=closeMobileNav;bar.querySelector('[data-view="tutor"]')?.addEventListener('click',()=>go('tutor'));
}
function closeMobileNav(){document.body.classList.remove('nav-open');const menu=$('#mobileMenu');if(menu)menu.setAttribute('aria-expanded','false');$('#mobileBackdrop')?.classList.add('hidden')}
function contextualize(id){const titles={dashboard:['Today','Your next best step'],academy:['Learn','Core Academy'],labs:['Practice','Interactive Labs'],missions:['Practice','Missions'],personalize:['My Path','Personal learning path'],quiz:['Learn','Check what you know'],tutor:['Learn','AI Tutor'],account:['My Path','Account']};const t=titles[id];if(t){if($('#viewEyebrow'))$('#viewEyebrow').textContent=t[0];if($('#viewTitle'))$('#viewTitle').textContent=t[1];if($('#mobileView'))$('#mobileView').textContent=t[1]}
 setCurrentNav(id);enhanceStatus();enhanceForms();
}
function wireEscape(){document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileNav()})}
export function initExperience(){ensureSkipLink();ensureMainId();simplifyNav();ensureMobile();enhanceStatus();enhanceForms();wireEscape();contextualize(document.querySelector('.view.active')?.id||'dashboard');window.addEventListener('hlo:view',e=>contextualize(e.detail?.id||'dashboard'))}
