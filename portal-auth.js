export async function initAuthUX({sb,$,pane,show}){
  const createForm=$('createForm');
  const createPane=$('createPane');
  const signInForm=$('signInForm');
  const pendingFlag='nexus_verification_expected';

  // The current operations module relabels legacy secure-file sections. Keep the new
  // preparation checklist outside that legacy relabeling path while preserving its
  // requested-files and shared-files labels.
  document.getElementById('dataRoomRequirements')?.closest('.secure-doc-section')?.classList.remove('secure-doc-section');

  // Make the verification requirement obvious before submission.
  if(createPane && createForm && !document.getElementById('portalVerificationPreflight')){
    const note=document.createElement('div');
    note.id='portalVerificationPreflight';
    note.className='portal-verify-preflight';
    note.innerHTML='<b>Important: verify your email after creating the account.</b><br>We will send you a confirmation link. Open that email and click the link once. Nexus will then show you a confirmation screen and bring you back to sign in.';
    createForm.appendChild(note);
  }

  // Password recovery is intentionally implemented through Supabase Auth rather than
  // custom tokens. The response is generic so the UI never confirms whether an email
  // address belongs to an account.
  if(signInForm&&!document.getElementById('forgotPasswordBtn')){
    const row=document.createElement('div');
    row.className='small';
    row.style.marginTop='12px';
    row.innerHTML='<button id="forgotPasswordBtn" type="button" class="btn secondary" style="min-height:40px">Forgot password?</button>';
    signInForm.appendChild(row);
    document.getElementById('forgotPasswordBtn')?.addEventListener('click',()=>showRecoveryRequestOverlay());
  }

  createForm?.addEventListener('submit',()=>{
    localStorage.setItem(pendingFlag,'1');
  },true);

  const search=new URLSearchParams(location.search);
  const hash=new URLSearchParams((location.hash||'').replace(/^#/,''));
  const authError=search.get('error_description')||search.get('error')||hash.get('error_description')||hash.get('error');
  const recoveryReturn=search.get('mode')==='recovery'||search.get('type')==='recovery'||hash.get('type')==='recovery';
  const looksLikeAuthReturn=
    search.has('code')||search.has('token_hash')||search.has('type')||
    hash.has('access_token')||hash.has('refresh_token')||hash.has('type');

  let session=null;
  try{session=(await sb.auth.getSession()).data.session}catch{}

  // Recovery takes precedence over the generic verification-return UX. This prevents
  // a stale signup flag from misclassifying a password-reset callback as verification.
  if(recoveryReturn){
    localStorage.removeItem(pendingFlag);
    if(authError||!session?.user){
      showVerificationOverlay(false,'That password-recovery link is invalid or has expired. Request a new recovery email and try again.');
      return;
    }
    showRecoveryResetOverlay();
    return;
  }

  const expected=localStorage.getItem(pendingFlag)==='1';
  if(authError){
    showVerificationOverlay(false,decodeURIComponent(String(authError).replace(/\+/g,' ')));
    return;
  }

  if((looksLikeAuthReturn||expected) && session?.user){
    localStorage.removeItem(pendingFlag);
    showVerificationOverlay(true);
  }

  function showRecoveryRequestOverlay(){
    if(document.getElementById('portalRecoveryOverlay'))return;
    const overlay=document.createElement('div');
    overlay.id='portalRecoveryOverlay';
    overlay.className='portal-verified-overlay';
    const suggested=$('signInEmail')?.value?.trim()||'';
    overlay.innerHTML=`<div class="portal-verified-card"><div class="eyebrow">Account recovery</div><h1>Reset your password.</h1><p>Enter the email address you use for Nexus. If it matches an account, Nexus will send a secure recovery link.</p><form id="portalRecoveryRequestForm"><div class="field"><label for="portalRecoveryEmail">Email</label><input id="portalRecoveryEmail" type="email" autocomplete="email" required value="${escapeHtml(suggested)}"></div><p id="portalRecoveryMessage" class="small" role="status" aria-live="polite"></p><div class="actions"><button id="portalRecoverySend" class="btn primary" type="submit">Send recovery email →</button><button id="portalRecoveryCancel" class="btn secondary" type="button">Cancel</button></div></form></div>`;
    document.body.appendChild(overlay);
    const email=document.getElementById('portalRecoveryEmail');
    setTimeout(()=>email?.focus(),0);
    document.getElementById('portalRecoveryCancel')?.addEventListener('click',()=>overlay.remove());
    document.getElementById('portalRecoveryRequestForm')?.addEventListener('submit',async event=>{
      event.preventDefault();
      const button=document.getElementById('portalRecoverySend');
      const message=document.getElementById('portalRecoveryMessage');
      const address=email?.value?.trim()||'';
      if(!address)return;
      if(button){button.disabled=true;button.textContent='Sending…'}
      if(message)message.textContent='';
      try{
        const {error}=await sb.auth.resetPasswordForEmail(address,{redirectTo:`${location.origin}/portal?mode=recovery`});
        if(error)throw error;
        if(message)message.textContent='If that email matches a Nexus account, a recovery link has been sent. Check your inbox and spam folder.';
        if(button)button.style.display='none';
        document.getElementById('portalRecoveryCancel').textContent='Close';
      }catch(error){
        console.error('Nexus password recovery request failed',error);
        // Keep account existence private even when the upstream provider supplies a specific error.
        if(message)message.textContent='The recovery request could not be completed right now. Try again in a few minutes.';
        if(button){button.disabled=false;button.textContent='Send recovery email →'}
      }
    });
  }

  function showRecoveryResetOverlay(){
    if(document.getElementById('portalRecoveryOverlay'))return;
    show?.('auth');
    const overlay=document.createElement('div');
    overlay.id='portalRecoveryOverlay';
    overlay.className='portal-verified-overlay';
    overlay.innerHTML='<div class="portal-verified-card"><div class="eyebrow">Secure password reset</div><h1>Create a new password.</h1><p>Use at least 12 characters with both letters and numbers.</p><form id="portalRecoveryResetForm"><div class="field"><label for="portalRecoveryPassword">New password</label><input id="portalRecoveryPassword" type="password" minlength="12" autocomplete="new-password" required></div><div class="field"><label for="portalRecoveryConfirm">Confirm new password</label><input id="portalRecoveryConfirm" type="password" minlength="12" autocomplete="new-password" required></div><p id="portalRecoveryResetMessage" class="small" role="status" aria-live="polite"></p><div class="actions"><button id="portalRecoveryReset" class="btn primary" type="submit">Update password →</button></div></form></div>';
    document.body.appendChild(overlay);
    const password=document.getElementById('portalRecoveryPassword');
    const confirm=document.getElementById('portalRecoveryConfirm');
    setTimeout(()=>password?.focus(),0);
    document.getElementById('portalRecoveryResetForm')?.addEventListener('submit',async event=>{
      event.preventDefault();
      const value=password?.value||'';
      const confirmation=confirm?.value||'';
      const message=document.getElementById('portalRecoveryResetMessage');
      const button=document.getElementById('portalRecoveryReset');
      if(value.length<12||!/[A-Za-z]/.test(value)||!/[0-9]/.test(value)){
        if(message)message.textContent='Use at least 12 characters with both letters and numbers.';
        return;
      }
      if(value!==confirmation){if(message)message.textContent='The passwords do not match.';return}
      if(button){button.disabled=true;button.textContent='Updating…'}
      try{
        const {error}=await sb.auth.updateUser({password:value});
        if(error)throw error;
        if(message)message.textContent='Password updated. Returning to sign in…';
        await sb.auth.signOut();
        history.replaceState({},'',location.pathname);
        setTimeout(()=>{
          overlay.remove();
          show?.('auth');
          pane?.('signInPane');
          const authMessage=document.getElementById('authMessage');
          if(authMessage){authMessage.textContent='Password updated. Sign in with your new password.';authMessage.style.color='var(--nx-muted)'}
        },500);
      }catch(error){
        console.error('Nexus password update failed',error);
        if(message)message.textContent='The password could not be updated. Request a fresh recovery link and try again.';
        if(button){button.disabled=false;button.textContent='Update password →'}
      }
    });
  }

  function showVerificationOverlay(ok,message=''){
    if(document.getElementById('portalVerifiedOverlay'))return;
    const overlay=document.createElement('div');
    overlay.id='portalVerifiedOverlay';
    overlay.className='portal-verified-overlay';
    overlay.innerHTML=ok
      ? `<div class="portal-verified-card"><div class="portal-verified-icon">✓</div><div class="eyebrow">Email verification complete</div><h1>Your email is verified.</h1><p>Your Nexus account is active. You can continue to your workspace now, or return to the sign-in screen.</p><div class="actions"><button id="verifiedContinue" class="btn primary" type="button">Continue to Nexus →</button><button id="verifiedSignIn" class="btn secondary" type="button">Return to Sign In</button></div></div>`
      : `<div class="portal-verified-card error"><div class="portal-verified-icon">!</div><div class="eyebrow">Verification problem</div><h1>We could not confirm that link.</h1><p>${escapeHtml(message||'The verification link may have expired or already been used. Return to Nexus and try signing in. If needed, create a fresh confirmation request.')}</p><div class="actions"><button id="verifiedSignIn" class="btn primary" type="button">Return to Sign In</button><a class="btn secondary" href="/">Main Website</a></div></div>`;
    document.body.appendChild(overlay);

    document.getElementById('verifiedContinue')?.addEventListener('click',()=>{
      overlay.remove();
      history.replaceState({},'',location.pathname);
      if(session?.user){location.reload();}
    });
    document.getElementById('verifiedSignIn')?.addEventListener('click',async()=>{
      overlay.remove();
      history.replaceState({},'',location.pathname);
      try{await sb.auth.signOut()}catch{}
      show?.('auth');
      pane?.('signInPane');
    });
  }
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
