export const DISCOVERY_CAPTURE_STATUS='draft';
export const DISCOVERY_PACKET_VERSION=7;
export const MASTER_DISCOVERY_FRAMEWORK_VERSION='2026-09-02';

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
    notes:run?.discovery_notes||packet.admin_context?.content||packet.discovery_notes,
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

export function buildDiscoveryPacket({draft={},company,project,evidence=[],mode='secured_execution',capturedAt=null,adminContext=null}={}){
  const value=normalizeDiscoveryDraft(draft);
  const adminContent=text(adminContext?.content||value.notes,40000)||null;
  return {
    version:DISCOVERY_PACKET_VERSION,
    framework_version:MASTER_DISCOVERY_FRAMEWORK_VERSION,
    company:{id:company?.id||null,name:text(company?.name,500),industry:text(company?.industry,500),website:text(company?.website,2000)},
    project:{id:project?.id||null,name:text(project?.name,500),service_type:text(project?.service_type,500)},
    agent:{code:'client_diagnosis',mode,permission_level:'draft_only'},
    capture:{source:'evidence_first_step2',captured_at:capturedAt||new Date().toISOString(),human_review_required:true},
    meeting:{date:value.meeting_date||null,participants:value.participants||null},
    admin_context:{id:adminContext?.id||null,content:adminContent,created_at:adminContext?.created_at||null},
    discovery_notes:adminContent,
    transcript_text:value.transcript||null,
    evidence_manifest:evidence.map(item=>({
      id:item.id,
      file_name:text(item.file_name,1000),
      mime_type:text(item.mime_type,500)||null,
      category:text(item.category,500),
      note:text(item.note,4000)||null,
      evidence_parser:text(item.evidence_parser,100)||null,
      evidence_summary:text(item.evidence_summary,4000)||null,
      created_at:item.created_at||null
    })),
    required_output:[
      'current_state','claims','facts','client_statements','admin_context','inferences','estimates','unknowns','evidence',
      'process_map','bottlenecks','root_causes','baseline_gaps','baseline_measurements','opportunity_backlog','risks',
      'follow_up_questions','smallest_safe_pilot','recommended_first_intervention','nexus_actions','client_action_items','document_requests','decision_items'
    ],
    claim_types:['FACT','CLIENT STATEMENT','ADMIN CONTEXT','INFERENCE','ESTIMATE','UNKNOWN'],
    prohibited_actions:['send emails','contact anyone outside approved client-workspace requests','modify client systems','make purchases','publish content','change permissions','take external action without explicit approval']
  };
}

// Compatibility helper for older capture callers. New Step 2 stores admin context in
// nexus_discovery_context_entries and creates diagnosis runs only when Run Diagnosis is used.
export function buildDiscoveryCapturePayload({draft,company,project,evidence=[],userId,capturedAt}={}){
  const value=normalizeDiscoveryDraft(draft);
  if(!company?.id)throw new Error('A client company is required.');
  if(!project?.id)throw new Error('An active engagement project is required.');
  if(!userId)throw new Error('An authenticated Nexus administrator is required.');
  if(!hasDiscoveryContext(value))throw new Error('Enter discovery context before capturing it.');
  const at=capturedAt||new Date().toISOString();
  return {
    company_id:company.id,
    project_id:project.id,
    agent_code:'client_diagnosis',
    status:DISCOVERY_CAPTURE_STATUS,
    meeting_date:value.meeting_date||null,
    participants:value.participants||null,
    discovery_notes:value.notes||null,
    analysis_packet:buildDiscoveryPacket({draft:value,company,project,evidence,mode:'legacy_capture',capturedAt:at}),
    created_by:userId,
    updated_at:at
  };
}
