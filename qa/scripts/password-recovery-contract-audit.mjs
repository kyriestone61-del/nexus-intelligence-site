import fs from 'node:fs';

const source=fs.readFileSync('portal-auth.js','utf8');
const failures=[];
const need=(text,message)=>{if(!source.includes(text))failures.push(message)};

need("sb.auth.resetPasswordForEmail",'Supabase recovery-email request is missing');
need("redirectTo:`${location.origin}/portal?mode=recovery`",'Recovery redirect is not pinned to the Nexus portal origin');
need("sb.auth.updateUser({password:value})",'Password update call is missing');
need("await sb.auth.signOut()",'Successful reset does not force a clean sign-in');
need("recoveryReturn",'Recovery callbacks are not distinguished from email verification');
need("localStorage.removeItem(pendingFlag)",'Recovery does not clear stale verification state');
need("If that email matches a Nexus account",'Recovery response is not account-enumeration safe');
need("value.length<12",'12-character password minimum is missing');
need("/[A-Za-z]/",'Password letter requirement is missing');
need("/[0-9]/",'Password number requirement is missing');
need("value!==confirmation",'Password confirmation match is missing');
need("role=\"status\"",'Recovery feedback lacks live status semantics');
need("autocomplete=\"new-password\"",'Recovery password fields lack new-password autocomplete');

if(/user not found|email does not exist|no account/i.test(source))failures.push('Recovery UI contains account-enumeration wording');
if(/service[_-]?role|SUPABASE_SERVICE|SECRET_KEY|RESEND_API_KEY|AI_GATEWAY_API_KEY/.test(source))failures.push('Privileged credential reference found in browser auth module');

console.log('# Nexus password recovery contract audit');
if(failures.length){failures.forEach(x=>console.error(`FAIL: ${x}`));process.exit(1)}
console.log('PASS: recovery uses provider-managed tokens, generic account-safe responses, strong password validation, and a clean post-reset sign-in boundary.');
