export async function initAuthUX({sb,$,pane,show}){
  const createForm=$('createForm');
  const createPane=$('createPane');
  const pendingFlag='nexus_verification_expected';

  // Make the verification requirement obvious before submission.
  if(createPane && createForm && !document.getElementById('portalVerificationPreflight')){
    const note=document.createElement('div');
    note.id='portalVerificationPreflight';
    note.className='portal-verify-preflight';
    note.innerHTML='<b>Important: verify your email after creating the account.</b><br>We will send you a confirmation link. Open that email and click the link once. Nexus will then show you a confirmation screen and bring you back to sign in.';
    createForm.appendChild(note);
  }

  createForm?.addEventListener('submit',()=>{
    localStorage.setItem(pendingFlag,'1');
  },true);

  const search=new URLSearchParams(location.search);
  const hash=new URLSearchParams((location.hash||'').replace(/^#/,''));
  const authError=search.get('error_description')||search.get('error')||hash.get('error_description')||hash.get('error');
  const looksLikeAuthReturn=
    search.has('code')||search.has('token_hash')||search.has('type')||
    hash.has('access_token')||hash.has('refresh_token')||hash.has('type');

  let session=null;
  try{session=(await sb.auth.getSession()).data.session}catch{}

  const expected=localStorage.getItem(pendingFlag)==='1';
  if(authError){
    showVerificationOverlay(false,decodeURIComponent(String(authError).replace(/\+/g,' ')));
    return;
  }

  if((looksLikeAuthReturn||expected) && session?.user){
    localStorage.removeItem(pendingFlag);
    showVerificationOverlay(true);
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
