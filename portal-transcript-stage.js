import {mountDiscoveryEvidence} from './portal-discovery-evidence.js?v=20260911-free-diagnosis-v4';
import {selectedTranscript} from './portal-full-diagnosis-stage.js';
export {selectedTranscript};
export function mountTranscriptStage(root,portal,{navigate,onChange=async()=>{}}){
 const roots=root?.nodeType?{transcript:root,freeDiagnosis:root,reviewFindings:root}:root;
 const evidence=mountDiscoveryEvidence(roots,portal,{navigate,onChange:data=>window.dispatchEvent(new CustomEvent('relystra:discovery-state',{detail:data}))});
 return {async refresh(snapshot){await evidence.refresh(snapshot)},destroy(){evidence.destroy()}};
}
