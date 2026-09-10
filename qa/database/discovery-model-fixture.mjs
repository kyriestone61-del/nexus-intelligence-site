// Deterministic substitute for the external model only. The real state machine,
// chunking, provenance validator, database leases and persisted reports run unchanged.
import {discoverySections} from '../../supabase/functions/_shared/relystra-discovery-evidence.ts';
export function serviceAdapter(db){
 const ident=k=>{if(!/^[a-z_]+$/.test(k))throw Error('Unsafe fixture identifier');return '"'+k+'"'};
 return {rpc:async(name,args)=>{try{const r=await db.query(`select ${ident(name)}(${Object.keys(args).map((k,i)=>`${ident(k)} => $${i+1}`).join(',')}) data`,Object.values(args));return {data:r.rows[0].data}}catch(error){return {error}}},from(table){let cols='*',where=[],params=[],sort=[],limit='',single=false;const q={select(c){cols=c==='*'?'*':c.split(',').map(ident).join(',');return q},eq(k,v){params.push(v);where.push(`${ident(k)}=$${params.length}`);return q},is(k){where.push(`${ident(k)} is null`);return q},in(k,v){params.push(v);where.push(`${ident(k)}=any($${params.length})`);return q},order(k,o={}){sort.push(`${ident(k)} ${o.ascending===false?'desc':'asc'}`);return q},limit(v){limit=' limit '+Number(v);return q},single(){single=true;return q},maybeSingle(){single=true;return q},async then(resolve,reject){try{const r=await db.query(`select ${cols} from ${ident(table)}${where.length?' where '+where.join(' and '):''}${sort.length?' order by '+sort.join(','):''}${limit}`,params);return resolve({data:single?r.rows[0]||null:r.rows})}catch(error){return resolve({error})}}};return q}};
}
export async function deterministicDiscoveryModel(cfg,label,instruction,payload){
 if(label==='Document evidence extractor'){const excerpt=payload.text.trim().slice(0,120);return {observations:[{statement:excerpt,excerpt,kind:'client_statement'}],missing_information:['Confirm frequency and responsibility.'],contradictions:[]};}
 const nodes=payload.nodes||payload.evidence,sourceIds=[...new Set(nodes.flatMap(x=>x.source_ids))];
 if(label==='Cross-document evidence synthesis')return {themes:sourceIds.map(id=>({text:'Synthetic source considered.',source_refs:[id]})),contradictions:[],missing_information:[]};
 const report={...Object.fromEntries(discoverySections.map(k=>[k,[{text:'Synthetic evidence describes intake and responsibility gaps.',confidence:'strongly_indicated',source_refs:sourceIds}]])),contradictions:[]};
 return label.startsWith('Independent')?{corrections:[],qa:{pass:true,issues:[]}}:report;
}
