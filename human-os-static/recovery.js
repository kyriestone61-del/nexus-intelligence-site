'use strict';
(async()=>{
 const status=document.getElementById('status'),form=document.getElementById('resetForm'),button=document.getElementById('savePassword');
 const hash=new URLSearchParams(location.hash.slice(1));
 const linkError=hash.has('error')||hash.has('error_code');
 const incomingRecovery=hash.get('type')==='recovery';
 const marker='human-os:recovery-user';
 if(linkError){sessionStorage.removeItem(marker);history.replaceState(null,'',location.pathname);status.textContent='This reset link has expired or is invalid. Return to Human OS and request a new link.';return;}
 if(!window.supabase){status.textContent='The password service could not load. Reload this page to try again.';return;}
 const sb=window.supabase.createClient('https://jzoqzbmllpnwxxfmvize.supabase.co','sb_publishable_3bDh9g_rfJjELy3IW8Rt0g_eFQK2msW');
 try{
  const {data,error}=await sb.auth.getSession();
  if(error||!data.session)throw Error('missing_session');
  const {data:userData,error:userError}=await sb.auth.getUser();
  if(userError||!userData.user)throw Error('invalid_session');
  if(!incomingRecovery&&sessionStorage.getItem(marker)!==userData.user.id)throw Error('missing_recovery');
  sessionStorage.setItem(marker,userData.user.id);
  history.replaceState(null,'',location.pathname);
  form.hidden=false;status.textContent='Use at least 8 characters for your new Human OS password.';
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   const password=document.getElementById('newPassword').value;
   if(password!==document.getElementById('confirmPassword').value){status.textContent='The passwords do not match.';return;}
   if(password.length<8){status.textContent='Use at least 8 characters.';return;}
   button.disabled=true;status.textContent='Saving your password…';
   try{
    const {error}=await sb.auth.updateUser({password});
    if(error){status.textContent=error.message;return;}
    sessionStorage.removeItem(marker);form.reset();form.hidden=true;
    await sb.auth.signOut({scope:'local'});
    status.textContent='Your Human OS password has been updated. Return to Human OS and sign in with your new password.';
   }catch{status.textContent='The request could not finish. Please try again.';}finally{button.disabled=false;}
  });
 }catch{
  sessionStorage.removeItem(marker);history.replaceState(null,'',location.pathname);
  status.textContent='Open the latest Human OS password-reset link from your email. If it has expired, return to Human OS and request another.';
 }
})();