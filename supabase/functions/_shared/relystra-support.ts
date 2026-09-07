export type SupportSource = {id:string;title:string;body:string;build_id?:string};
export function verifiedSupportPassages(result: unknown,sources: SupportSource[]) {
  if(!result||typeof result!=='object')return [];
  const value=result as {supported?:boolean;confidence?:number;citations?:Array<{source_id:string;quote:string}>};
  if(value.supported!==true||typeof value.confidence!=='number'||value.confidence<0.85||value.confidence>1||!Array.isArray(value.citations)||!value.citations.length||value.citations.length>5)return [];
  const passages=[];
  for(const citation of value.citations){
    const source=sources.find(s=>s.id===citation?.source_id);
    if(!source||typeof citation.quote!=='string'||!citation.quote.trim()||citation.quote.length>3000||!source.body.includes(citation.quote))return [];
    passages.push({source_id:source.id,quote:citation.quote});
  }
  return passages;
}
