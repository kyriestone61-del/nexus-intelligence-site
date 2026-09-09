import {mountDiscoveryEvidence} from './portal-discovery-evidence.js';
import {mountFullDiagnosisStage,selectedTranscript} from './portal-full-diagnosis-stage.js';
export {selectedTranscript};
export function mountTranscriptStage(root,portal,{navigate,onChange=async()=>{}}){
 const discoveryRoot=document.createElement('div'),fullRoot=document.createElement('div');root.replaceChildren(discoveryRoot,fullRoot);
 const evidence=mountDiscoveryEvidence(discoveryRoot,portal,{navigate,onChange:()=>window.dispatchEvent(new CustomEvent('relystra:discovery-state'))});
 const full=mountFullDiagnosisStage(fullRoot,portal,{navigate,onChange});
 return {async refresh(snapshot){await evidence.refresh(snapshot);fullRoot.hidden=!snapshot?.diagnosis?.access;if(!fullRoot.hidden)full.refresh(snapshot)},destroy(){evidence.destroy();full.destroy()}};
}
