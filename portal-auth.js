export async function initAuthUX({sb,$,pane,show,runtime}){
  const createForm=$('createForm');
  const createPane=$('createPane');
  const signInForm=$('signInForm');
  const pendingFlag='nexus_verification_expected';
  const storage=runtime?.storage||fallbackStorage();
  const events=runtime?.events||fallbackEvents();
  const boundary=runtime?.boundary||fallbackBoundary();
  const modals=runtime?.modals||null;

  document.getElementById('dataRoomRequirements')?.closest('.secure-doc-section')?.classList.remove('secure-doc-section');

  if(createPane&&createForm&&!document.getElementById('portalVerificationPreflight')){
    const note=document.createElement('details');
    note.id='portalVerificationPreflight';
    note.className='portal-verify-preflight nexus-progressive-help';
    note.innerHTML='<summary>Email verification</summary><p><b>After creating your account, verify your email once.</b> Open the confirmation message from Relystra, click the verification link, then return here to sign in.</p>';
    createForm.appendChild(note);
  }

  if(signInForm&&!document.getElementById('forgotPasswordBtn')){
    const row=document.createElement('div');
    row.className='small';row.style.marginTop='12px';
    row.innerHTML='<button id="forgotPasswordBtn" type="button" class="btn secondary" style="min-height:44px">Forgot password?</button>';
    signInForm.appendChild(row);
    events.bind(document.getElementById('forgotPasswordBtn'),'click','auth:forgot-password',()=>showRecoveryRequestOverlay());
  }

  events.bind(createForm,'submit','auth:verification-expected',()=>storage.set(pendingFlag,'1'),true);

  const search=new URLSearchParams(location.search);
  const hash=new URLSearchParams((location.hash||'').replace(/^#/,''));
  const authError=search.get('error_description')||search.get('error')||hash.get('error_description')||hash.get('error');
  const recoveryReturn=search.get('mode')==='recovery'||search.get('type')==='recovery'||hash.get('type')==='recovery';
  const looksLikeAuthReturn=search.has('code')||search.has('token_hash')||search.has('type')||hash.has('access_token')||hash.has('refresh_token')||hash.has('type');

  let session=null;
  try{const result=await sb.auth.getSession();session=result.data?.session||null;if(result.error)console.warn('Relystra auth session check failed',result.error)}catch(error){console.warn('Relystra auth session check failed',error)}

  if(recoveryReturn){
    storage.remove(pendingFlag);
    if(authError||!session?.user){showVerificationOverlay(false,'That password-recovery link is invalid or has expired. Request a new recovery email and try again.');return}
    showRecoveryResetOverlay();return;
  }

  const expected=storage.get(pendingFlag)==='1';
  if(authError){showVerificationOverlay(false,decodeURIComponent(String(authError).replace(/\+/g,' ')));return}
  if((looksLikeAuthReturn||expected)&&session?.user){storage.remove(pendingFlag);showVerificationOverlay(true)}

  function appendOverlay(overlay,focusSelector){
    document.body.appendChild(overlay);
    if(modals){modals.open(overlay,document.activeElement)}
    else setTimeout(()=>overlay.querySelector(focusSelector||'button,input')?.focus(),0);
  }
  function removeOverlay(overlay){
    if(!overlay)return;
    if(modals)modals.close(overlay);
    setTimeout(()=>overlay.remove(),0);
  }

  function showRecoveryRequestOverlay(){
    if(document.getElementById('portalRecoveryOverlay'))return;
    const overlay=document.createElement('div');overlay.id='portalRecoveryOverlay';overlay.className='portal-verified-overlay';overlay.tabIndex=-1;
    const suggested=$('signInEmail')?.value?.trim()||'';
    overlay.innerHTML=`<div class="portal-verified-card" aria-labelledby="portalRecoveryTitle"><div class="eyebrow">Account recovery</div><h1 id="portalRecoveryTitle">Reset your password.</h1><p>Enter your Relystra email. If it matches an account, we will queue a secure recovery request.</p><form id="portalRecoveryRequestForm"><div class="field"><label for="portalRecoveryEmail">Email</label><input id="portalRecoveryEmail" type="email" autocomplete="email" required value="${escapeHtml(suggested)}"></div><p id="portalRecoveryMessage" class="small" role="status" aria-live="polite"></p><div class="actions"><button id="portalRecoverySend" class="btn primary" type="submit">Request recovery →</button><button id="portalRecoveryCancel" class="btn secondary" type="button">Cancel</button></div></form></div>`;
    appendOverlay(overlay,'#portalRecoveryEmail');
    const email=document.getElementById('portalRecoveryEmail');
    events.bind(document.getElementById('portalRecoveryCancel'),'click','recovery:cancel',()=>removeOverlay(overlay));
    events.bind(document.getElementById('portalRecoveryRequestForm'),'submit','recovery:request',boundary.wrap('password recovery request',async event=>{
      event.preventDefault();const button=document.getElementById('portalRecoverySend'),message=document.getElementById('portalRecoveryMessage'),address=email?.value?.trim()||'';if(!address)return;
      if(button){button.disabled=true;button.textContent='Requesting…'}if(message)message.textContent='';
      try{
        const response=await fetch('/api/auth-email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'recovery',email:address})});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload?.error||`Recovery request failed (${response.status})`);
        if(message)message.textContent=payload?.message||'If that email matches a Relystra account, a secure recovery request has been queued. Delivery can be delayed if the transactional provider is temporarily at capacity.';
        if(button)button.hidden=true;const cancel=document.getElementById('portalRecoveryCancel');if(cancel)cancel.textContent='Close';
      }
      catch(error){console.error('Relystra password recovery request failed',error);if(message)message.textContent='The recovery email service is temporarily unavailable. Try again in a few minutes.';if(button){button.disabled=false;button.textContent='Request recovery →'}}
    },{silent:true}));
  }

  function showRecoveryResetOverlay(){
    if(document.getElementById('portalRecoveryOverlay'))return;
    show?.('auth');
    const overlay=document.createElement('div');overlay.id='portalRecoveryOverlay';overlay.className='portal-verified-overlay';overlay.tabIndex=-1;
    overlay.innerHTML='<div class="portal-verified-card" aria-labelledby="portalRecoveryResetTitle"><div class="eyebrow">Secure password reset</div><h1 id="portalRecoveryResetTitle">Create a new password.</h1><p>Use at least 12 characters with both letters and numbers.</p><form id="portalRecoveryResetForm"><div class="field"><label for="portalRecoveryPassword">New password</label><input id="portalRecoveryPassword" type="password" minlength="12" autocomplete="new-password" required></div><div class="field"><label for="portalRecoveryConfirm">Confirm new password</label><input id="portalRecoveryConfirm" type="password" minlength="12" autocomplete="new-password" required></div><p id="portalRecoveryResetMessage" class="small" role="status" aria-live="polite"></p><div class="actions"><button id="portalRecoveryReset" class="btn primary" type="submit">Update password →</button></div></form></div>';
    appendOverlay(overlay,'#portalRecoveryPassword');
    const password=document.getElementById('portalRecoveryPassword'),confirm=document.getElementById('portalRecoveryConfirm');
    events.bind(document.getElementById('portalRecoveryResetForm'),'submit','recovery:reset',boundary.wrap('password update',async event=>{
      event.preventDefault();const value=password?.value||'',confirmation=confirm?.value||'',message=document.getElementById('portalRecoveryResetMessage'),button=document.getElementById('portalRecoveryReset');
      if(value.length<12||!/[A-Za-z]/.test(value)||!/[0-9]/.test(value)){if(message)message.textContent='Use at least 12 characters with both letters and numbers.';return}
      if(value!==confirmation){if(message)message.textContent='The passwords do not match.';return}
      if(button){button.disabled=true;button.textContent='Updating…'}
      try{const {error}=await sb.auth.updateUser({password:value});if(error)throw error;if(message)message.textContent='Password updated. Returning to sign in…';await sb.auth.signOut();history.replaceState({},'',location.pathname);setTimeout(()=>{removeOverlay(overlay);show?.('auth');pane?.('signInPane');const authMessage=document.getElementById('authMessage');if(authMessage){authMessage.textContent='Password updated. Sign in with your new password.';authMessage.style.color='var(--nx-muted)'}},350)}
      catch(error){console.error('Relystra password update failed',error);if(message)message.textContent='The password could not be updated. Request a fresh recovery link and try again.';if(button){button.disabled=false;button.textContent='Update password →'}}
    },{silent:true}));
  }

  function showVerificationOverlay(ok,message=''){
    if(document.getElementById('portalVerifiedOverlay'))return;
    const overlay=document.createElement('div');overlay.id='portalVerifiedOverlay';overlay.className='portal-verified-overlay';overlay.tabIndex=-1;
    overlay.innerHTML=ok
      ? `<div class="portal-verified-card"><div class="portal-verified-icon">✓</div><div class="eyebrow">Email verification complete</div><h1>Your email is verified.</h1><p>Your Relystra account is active.</p><div class="actions"><button id="verifiedContinue" class="btn primary" type="button">Continue to Relystra →</button><button id="verifiedSignIn" class="btn secondary" type="button">Return to Sign In</button></div></div>`
      : `<div class="portal-verified-card error"><div class="portal-verified-icon">!</div><div class="eyebrow">Verification problem</div><h1>We could not confirm that link.</h1><p>${escapeHtml(message||'The verification link may have expired or already been used. Return to Relystra and try signing in.')}</p><div class="actions"><button id="verifiedSignIn" class="btn primary" type="button">Return to Sign In</button><a class="btn secondary" href="/">Main Website</a></div></div>`;
    appendOverlay(overlay,ok?'#verifiedContinue':'#verifiedSignIn');
    events.bind(document.getElementById('verifiedContinue'),'click','verification:continue',()=>{removeOverlay(overlay);history.replaceState({},'',location.pathname);if(session?.user)location.reload()});
    events.bind(document.getElementById('verifiedSignIn'),'click','verification:signin',boundary.wrap('verification sign out',async()=>{removeOverlay(overlay);history.replaceState({},'',location.pathname);try{await sb.auth.signOut()}catch(error){console.warn('Verification sign-out cleanup failed',error)}show?.('auth');pane?.('signInPane')},{silent:true}));
  }
}

function fallbackStorage(){return{get:(key,fallback=null)=>{try{return localStorage.getItem(key)??fallback}catch{return fallback}},set:(key,value)=>{try{localStorage.setItem(key,String(value));return true}catch{return false}},remove:key=>{try{localStorage.removeItem(key);return true}catch{return false}}}}
function fallbackEvents(){return{bind:(element,type,_key,handler,options)=>{element?.addEventListener(type,handler,options);return()=>element?.removeEventListener(type,handler,options)}}}
function fallbackBoundary(){return{wrap:(_label,handler)=>async(...args)=>{try{return await handler(...args)}catch(error){console.error(error)}}}}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
