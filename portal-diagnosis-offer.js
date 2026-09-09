export function mountDiagnosisOffer(root,portal){
 return {async refresh(snapshot){
  if(!snapshot?.company_id){root.replaceChildren();return}
  root.innerHTML=snapshot.diagnosis?.access?'<p>Full Diagnosis and your Roadmap are included in your engagement.</p>':'<article class="relystra-build-card"><h2>Free Discovery, then one clear first Build</h2><p>Your Basic Report explains the recommended workflow, scope and approved price. After the first implementation payment or required deposit, your private workspace includes Full Diagnosis and your Roadmap.</p><p>No additional purchase is required to continue your original scope.</p></article>';
 },destroy(){root.replaceChildren()}};
}
