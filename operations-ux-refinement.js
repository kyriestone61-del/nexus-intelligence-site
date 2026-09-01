const replacements=new Map([
 ['Daily Command Brief','Today'],
 ['What requires judgment now?','What needs your attention?'],
 ['Top founder priorities','Top priorities'],
 ['Resolve the highest-consequence items first.','Handle the highest-impact items first.'],
 ['No material decision or exception is currently queued.','Nothing urgent needs your attention right now.'],
 ['Evidence & proof gates','Evidence & proof'],
 ['What Nexus can and cannot responsibly claim today.','What Nexus can support with evidence today.'],
 ['Client operating pressure','Client work requiring attention'],
 ['Eight operating domains','Business areas'],
 ['Decision Queue','Decisions'],
 ['Agents & Evaluations','AI Agents'],
 ['Workflows & Health','Automations'],
 ['Canon, Memory & Evidence','Knowledge & Evidence'],
 ['Improvement Engine','Improvements'],
 ['Tool Governance','Connected Tools'],
 ['Operating Reviews','Reviews']
]);
function refine(root=document){
  root.querySelectorAll?.('h1,h2,h3,.eyebrow,.ops-section-copy,.ops-native-nav button').forEach(el=>{
    const current=el.textContent.trim(),next=replacements.get(current);
    if(next&&next!==current)el.textContent=next;
  });
}
refine();
let queued=false;
const observer=new MutationObserver(()=>{
  if(queued)return;queued=true;
  requestAnimationFrame(()=>{queued=false;refine()});
});
observer.observe(document.getElementById('consoleApp')||document.body,{subtree:true,childList:true});
window.NexusOperationsUX={refresh:refine};
