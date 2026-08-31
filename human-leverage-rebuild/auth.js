import{sb,S,$,toast}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=core.js';
let mode='login';
const el=id=>document.getElementById(id);
function setMode(m){
 mode=m;
 const name=el('nameWrap'),submitBtn=el('authSubmit'),login=el('loginTab'),signup=el('signupTab'),pass=el('authPassword'),terms=el('termsWrap');
 if(name)name.style.display=m==='signup'?'grid':'none';
 if(terms)terms.classList.toggle('hidden',m!=='signup');
 if(submitBtn)submitBtn.textContent=m==='signup'?'Create account':'Sign in';
 login?.classList.toggle('primary',m==='login');signup?.classList.toggle('primary',m==='signup');
 if(pass)pass.autocomplete=m==='signup'?'new-password':'current-password';
 msg(m==='signup'?'Create your account. Your curriculum and progress will sync across devices.':'Use your Human OS account credentials.');
}
function showPanel(m='login'){
 setMode(m);
 const panel=el('authPanel');
 if(panel){panel.classList.remove('hidden');setTimeout(()=>el('authEmail')?.focus(),20);return}
 const gate=el('authGate');if(gate)gate.classList.remove('hidden');
}
function hidePanel(){const panel=el('authPanel');if(panel)panel.classList.add('hidden')}
function openPreview(){hidePanel();el('authGate')?.classList.add('hidden');S.offline=true;if(el('cloudStatus'))el('cloudStatus').textContent='Local preview';toast('Local preview opened')}
function bind(id,fn){const node=el(id);if(node)node.onclick=fn}
export function initAuth(){
 setMode('login');
 bind('loginTab',()=>setMode('login'));bind('signupTab',()=>setMode('signup'));bind('authSubmit',submit);bind('offlineBtn',openPreview);
 ['marketingSignIn','footerSignIn'].forEach(id=>bind(id,()=>showPanel('login')));
 ['marketingStart','heroStart','planFree','planPlus'].forEach(id=>bind(id,()=>showPanel('signup')));
 bind('marketingExplore',openPreview);bind('closeAuth',hidePanel);
 bind('togglePassword',()=>{const p=el('authPassword'),b=el('togglePassword');if(!p||!b)return;const show=p.type==='password';p.type=show?'text':'password';b.textContent=show?'Hide':'Show'});
 bind('forgotPassword',forgotPassword);
 el('authPanel')?.addEventListener('click',e=>{if(e.target===el('authPanel'))hidePanel()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!el('authPanel')?.classList.contains('hidden'))hidePanel()});
}
export function openAfterAuth(){if(S.user){hidePanel();el('authGate')?.classList.add('hidden')}}
async function forgotPassword(){const email=el('authEmail')?.value.trim()||'';if(!email.includes('@'))return msg('Enter your email first, then choose Forgot password.');try{msg('Sending password reset…');const{error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});if(error)return msg(error.message);msg('Password reset email sent.')}catch(e){msg('Could not send reset email. '+(e?.message||e))}}
async function submit(){
 const email=el('authEmail')?.value.trim()||'',password=el('authPassword')?.value||'',name=el('authName')?.value.trim()||'';
 if(!email.includes('@'))return msg('Enter a valid email.');if(password.length<8)return msg('Use at least 8 characters.');
 if(mode==='signup'&&el('acceptTerms')&&!el('acceptTerms').checked)return msg('Accept the Terms and Privacy notice to create an account.');
 const btn=el('authSubmit');if(btn)btn.disabled=true;
 try{
  if(mode==='login'){
   msg('Signing in…');const{data,error}=await sb.auth.signInWithPassword({email,password});if(error)return msg(error.message);if(data.session){msg('Signed in. Loading your system…');setTimeout(()=>location.reload(),250)}
  }else{
   msg('Creating account…');const{data,error}=await sb.auth.signUp({email,password,options:{data:{display_name:name||email.split('@')[0]},emailRedirectTo:window.location.origin}});if(error)return msg(error.message);if(data.session){msg('Account created. Loading…');setTimeout(()=>location.reload(),250)}else msg('Check your email to confirm the account, then return and sign in.')
  }
 }catch(e){msg('Authentication failed. '+(e?.message||e))}finally{if(btn)btn.disabled=false}
}
function msg(t){const m=el('authMsg');if(m)m.textContent=t}
