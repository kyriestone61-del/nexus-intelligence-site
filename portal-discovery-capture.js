export const DISCOVERY_CAPTURE_STATUS='draft';
export const DISCOVERY_PACKET_VERSION=6;

const text=(value,limit)=>String(value??'').trim().slice(0,limit);

export function normalizeDiscoveryDraft(value={}){
  return {
    meeting_date:text(value.meeting_date,10),
    participants:text(value.participants,4000),
    notes:text(value.notes,40000),
    transcript:text(value.transcript,120000),
    updated_at:text(value.updated_at,40)
  };
}

export function hasDiscoveryContext(value={}){
  const draft=normalizeDiscoveryDraft(value);
  return !!(draft.meeting_date||draft.participants||draft.notes||draft.transcript);
}

export function draftFromDiagnosisRun(run){
  const packet=run?.analysis_packet||{};
  return normalizeDiscoveryDraft({
    meeting_date:run?.meeting_date||packet.meeting?.date,
    participants:run?.participants||packet.meeting?.participants,
    notes:run?.discovery_notes||packet.discovery_notes,
    transcript:packet.transcript_text,
    updated_at:run?.updated_at||run?.created_at
  });
}

export function chooseNewestDraft(localDraft,capturedRun){
  const local=normalizeDiscoveryDraft(localDraft);
  if(!capturedRun)return local;
  const captured=draftFromDiagnosisRun(capturedRun);
  const localAt=Date.parse(local.updated_at||'')||0;
  const capturedAt=Date.parse(captured.updated_at||'')||0;
  return capturedAt>localAt?captured:local;
}

export function buildDiscoveryPacket({draft,company,project,evidence=[],mode='captured_context',capturedAt=null}={}){
  const value=normalizeDiscoveryDraft(draft);
  return {
    version:DISCOVERY_PACKET_VERSION,
    company:{id:company?.id||null,name:text(company?.name,500),industry:text(company?.industry,500),website:text(company?.website,2000)},
    project:{id:project?.id||null,name:text(project?.name,500),service_type:text(project?.service_type,500)},
    agent:{code:'client_diagnosis',mode,permission_level:'draft_only'},
    capture:{source:'meeting_record',captured_at:capturedAt||null,human_review_required:true},
    meeting:{date:value.meeting_date||null,participants:value.participants||null},
    discovery_notes:value.notes||null,
    transcript_text:value.transcript||null,
    evidence_manifest:evidence.map(item=>({
      id:item.id,
      file_name:text(item.file_name,1000),
      category:text(item.category,500),
      note:text(item.note,4000)||null,
      created_at:item.created_at||null
    })),
    required_output:['facts','client_statements','inferences','unknowns','process_map','bottlenecks','baseline_gaps','baseline_measurements','opportunity_backlog','risks','follow_up_questions','smallest_safe_pilot','nexus_actions','client_action_items','document_requests','decision_items'],
    prohibited_actions:['send emails','contact anyone','modify client systems','make purchases','publish content','change permissions','take external action without explicit approval']
  };
}

export function buildDiscoveryCapturePayload({draft,company,project,evidence=[],userId,capturedAt}={}){
  const value=normalizeDiscoveryDraft(draft);
  if(!company?.id)throw new Error('A client company is required.');
  if(!project?.id)throw new Error('An active engagement project is required.');
  if(!userId)throw new Error('An authenticated Nexus administrator is required.');
  if(!hasDiscoveryContext(value))throw new Error('Enter meeting context before capturing it.');
  const at=capturedAt||new Date().toISOString();
  return {
    company_id:company.id,
    project_id:project.id,
    agent_code:'client_diagnosis',
    status:DISCOVERY_CAPTURE_STATUS,
    meeting_date:value.meeting_date||null,
    participants:value.participants||null,
    discovery_notes:value.notes||null,
    analysis_packet:buildDiscoveryPacket({draft:value,company,project,evidence,mode:'captured_context',capturedAt:at}),
    created_by:userId,
    updated_at:at
  };
}
