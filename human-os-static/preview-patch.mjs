import { readFile, writeFile } from 'node:fs/promises';

async function patchFile(path, transforms) {
  let text=await readFile(path,'utf8');
  for (const [from,to,label] of transforms) {
    if(!text.includes(from)) throw new Error(`${label} patch target not found in ${path}`);
    text=text.replace(from,to);
  }
  await writeFile(path,text,'utf8');
}

await patchFile('dist/assets/tutor-v2.js',[[
  "sb.functions.invoke('hlo-tutor'",
  "sb.functions.invoke('hlo-tutor-stream'",
  'Tutor candidate routing'
]]);

await patchFile('dist/assets/core.js',[
  [
    "export const S={session:null,user:null,owner:false,offline:false,profile:null,progress:[],quizAttempts:[],missions:[],labAttempts:[],certs:[],research:[],curriculum:null,questionBank:[],modules:[],module:null,capability:null};",
    "export const S={session:null,user:null,owner:false,plus:false,offline:false,profile:null,progress:[],quizAttempts:[],missions:[],labAttempts:[],certs:[],research:[],curriculum:null,questionBank:[],modules:[],module:null,capability:null};",
    'Plus state'
  ],
  [
    "sb.from('hlo_capability_profiles').select('*').eq('user_id',uid).maybeSingle()]);const[p,prog,qa,mis,labs,cert,res,qb,cur,own,cap]=queries;",
    "sb.from('hlo_capability_profiles').select('*').eq('user_id',uid).maybeSingle(),sb.rpc('hlo_is_plus_member')]);const[p,prog,qa,mis,labs,cert,res,qb,cur,own,cap,plus]=queries;",
    'Plus entitlement load'
  ],
  [
    "S.curriculum=cur.data?.curriculum||null;S.owner=!!own.data;S.capability=cap.data||null;document.body.classList.toggle('owner',S.owner);",
    "S.curriculum=cur.data?.curriculum||null;S.owner=!!own.data;S.capability=cap.data||null;S.plus=!!plus.data;document.body.classList.toggle('owner',S.owner);document.body.classList.toggle('plus',S.plus);",
    'Plus entitlement state assignment'
  ],
  [
    "$('#accountLabel').textContent=S.owner?'Owner account':(S.user.email||'Signed in');",
    "$('#accountLabel').textContent=S.owner?'Owner account':(S.plus?'Human OS+':(S.user.email||'Signed in'));",
    'Plus account label'
  ]
]);

await patchFile('dist/assets/personalize.js',[
  [
    "async function generate(){if(!S.user)return toast('Sign in to generate and save a personal curriculum.');if(!state.answers.goal||!state.answers.future||!state.answers.build)return toast('Complete the direction questions first.');",
    "async function generate(){if(!S.user)return toast('Sign in to generate and save a personal curriculum.');if(S.curriculum&&!S.owner&&!S.plus){window.HLOAnalytics?.track?.('paywall_viewed',{object_id:'additional-path',entitlement:'human_os_plus'});return toast('Human OS+ unlocks additional personalized paths while preserving your current path.');}if(!state.answers.goal||!state.answers.future||!state.answers.build)return toast('Complete the direction questions first.');",
    'Additional path Plus gate'
  ],
  [
    "async function recalibrate(){if(!S.user||!S.curriculum)return;const changed=$('#pathChanged').value.trim(),stuck=$('#pathStuck').value.trim(),priority=$('#pathPriority').value.trim(),project=$('#pathProject').value.trim();",
    "async function recalibrate(){if(!S.user||!S.curriculum)return;if(!S.owner&&!S.plus){window.HLOAnalytics?.track?.('paywall_viewed',{object_id:'living-path-recalibration',entitlement:'human_os_plus'});return toast('Human OS+ unlocks Living Path recalibration as your goals and evidence change.');}const changed=$('#pathChanged').value.trim(),stuck=$('#pathStuck').value.trim(),priority=$('#pathPriority').value.trim(),project=$('#pathProject').value.trim();",
    'Living Path Plus gate'
  ]
]);

console.log('Human OS preview uses the AI-era Tutor candidate and explicit Free/Plus path-continuity gates.');
