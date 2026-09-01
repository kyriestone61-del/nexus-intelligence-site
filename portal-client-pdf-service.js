/**
 * Dependency-free client PDF service.
 * Builds a standards-compliant text PDF in-browser and downloads it directly.
 */
const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable for PDF service.');
const {runtime,toast}=portal;
const {events}=runtime;
const ascii=value=>String(value??'').normalize('NFKD').replace(/[^\x20-\x7E\n]/g,' ').replace(/\s+/g,' ').trim();
const pdfEsc=value=>ascii(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const filename=value=>ascii(value||'Nexus Client Diagnosis').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90)||'nexus-report';
function wrap(text,width=88){const words=ascii(text).split(/\s+/).filter(Boolean),lines=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(next.length>width&&line){lines.push(line);line=word}else line=next}if(line)lines.push(line);return lines}
function addSection(lines,title,items){if(!Array.isArray(items)||!items.length)return;lines.push('',title.toUpperCase());for(const item of items){const label=typeof item==='string'?item:item?.title||item?.name||item?.opportunity||item?.summary||item?.description||'Finding',copy=typeof item==='string'?'':item?.summary||item?.description||item?.rationale||item?.observation||'';lines.push(`- ${ascii(label)}`);if(copy)lines.push(...wrap(copy,82).map(line=>`  ${line}`))}}
function reportLines(report){const lines=['NEXUS INTELLIGENCE',ascii(report.title||'Client Diagnosis & Implementation Roadmap'),''];lines.push(...wrap(report.executive_summary||'Client-safe diagnosis and implementation roadmap.'));addSection(lines,'Key Bottlenecks',report.bottlenecks);addSection(lines,'Opportunity Backlog',report.opportunity_backlog);addSection(lines,'Client Action Items',report.client_action_items);lines.push('','Planning note: estimates, assumptions, scope, and dates should be reviewed against the applicable engagement documents.');return lines}
function buildPdf(lines){
  const perPage=43,pages=[];for(let i=0;i<lines.length;i+=perPage)pages.push(lines.slice(i,i+perPage));if(!pages.length)pages.push(['NEXUS INTELLIGENCE']);
  const objects=[];const add=content=>{objects.push(content);return objects.length};
  const catalog=add(''),pagesId=add(''),font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds=[];
  for(const pageLines of pages){let stream='BT\n/F1 10 Tf\n50 750 Td\n';pageLines.forEach((line,index)=>{const isTitle=index<2||(/^[A-Z][A-Z ]+$/.test(line)&&line.length<50);stream+=`${isTitle?'/F2 11 Tf':'/F1 10 Tf'}\n(${pdfEsc(line)}) Tj\n0 -16 Td\n`});stream+='ET';const contentId=add(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`),pageId=add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${contentId} 0 R >>`);pageIds.push(pageId)}
  objects[catalog-1]=`<< /Type /Catalog /Pages ${pagesId} 0 R >>`;objects[pagesId-1]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let output='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(new TextEncoder().encode(output).length);output+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`}const xref=new TextEncoder().encode(output).length;output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)output+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;output+=`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;return new Blob([output],{type:'application/pdf'})
}
function findReport(id){return (portal.state.clientData?.diagnosisReleases||[]).find(report=>String(report.releaseId||report.id)===String(id))||null}
function downloadReport(report){if(!report){toast('Report could not be found.');return false}const blob=buildPdf(reportLines(report)),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`${filename(report.title)}.pdf`;anchor.style.display='none';document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('PDF downloaded.');return true}
const main=document.querySelector('.main');if(main)events.delegate(main,'click','client-pdf:download','[data-report-pdf]',(event,target)=>{event.preventDefault();event.stopImmediatePropagation();downloadReport(findReport(target.dataset.reportPdf))},{capture:true});
const service=Object.freeze({downloadReport,buildPdf,reportLines,findReport});portal.services=portal.services||{};portal.services.clientPdf=service;window.NexusClientPdfService=service;
