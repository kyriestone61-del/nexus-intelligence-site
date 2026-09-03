import { readFile, writeFile } from 'node:fs/promises';

const path='dist/assets/tutor-v2.js';
let js=await readFile(path,'utf8');
const from="sb.functions.invoke('hlo-tutor'";
const to="sb.functions.invoke('hlo-tutor-stream'";
if(!js.includes(from)) throw new Error('Tutor preview patch target not found');
js=js.replace(from,to);
await writeFile(path,js,'utf8');
console.log('Human OS preview uses context-aware AI-era Tutor candidate via hlo-tutor-stream.');
