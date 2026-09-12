import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
const oldProject='dmdgkjksouhhsuojthav';
const project='jzoqzbmllpnwxxfmvize';
const key='sb_publishable_3bDh9g_rfJjELy3IW8Rt0g_eFQK2msW';
for(const file of await readdir('dist/assets')){
 if(!file.endsWith('.js'))continue;
 const path='dist/assets/'+file;
 let text=await readFile(path,'utf8');
 text=text.replaceAll(oldProject+'.supabase.co',project+'.supabase.co').replaceAll('sb_publishable_-bZLK1vmL0eUMz65A6EUsw_I20LBq2B',key);
 if(file==='auth.js'){
  const from='redirectTo:window.location.origin';
  if(!text.includes(from))throw Error('Recovery redirect patch target missing');
  text=text.replace(from,"redirectTo:window.location.origin+'/auth/recovery/'");
  text=text.replace("Check your email to confirm the account, then return and sign in.","If this is a new account, check your email for a Human OS confirmation link. If you already have an account, sign in or use Forgot password.");
  text=text.replace("msg('Password reset email sent.')","msg('If an account exists for this email, you will receive a Human OS password-reset link. Check your inbox and spam folder.')");
 }
 await writeFile(path,text);
}
await mkdir('dist/auth/recovery',{recursive:true});
await writeFile('dist/auth/recovery/index.html',await readFile('recovery.html','utf8'));
await writeFile('dist/assets/recovery.js',await readFile('recovery.js','utf8'));
console.log('Human OS uses its isolated authentication project and recovery screen.');
