import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISCOVERY_CAPTURE_STATUS,
  DISCOVERY_PACKET_VERSION,
  MASTER_DISCOVERY_FRAMEWORK_VERSION,
  buildDiscoveryCapturePayload,
  buildDiscoveryPacket,
  chooseNewestDraft,
  hasDiscoveryContext
} from '../../portal-discovery-capture.js';

const company={id:'company-1',name:'Acme',industry:'Services',website:'https://example.test'};
const project={id:'project-1',name:'Opportunity Assessment',service_type:'Assessment'};

test('legacy capture helper still requires company, active project, administrator, and meaningful discovery context',()=>{
  assert.equal(hasDiscoveryContext({notes:'Observed a manual handoff.'}),true);
  assert.equal(hasDiscoveryContext({notes:'   '}),false);
  assert.throws(()=>buildDiscoveryCapturePayload({draft:{notes:'Context'},company,userId:'admin-1'}),/active engagement project/i);
  assert.throws(()=>buildDiscoveryCapturePayload({draft:{},company,project,userId:'admin-1'}),/discovery context/i);
});

test('legacy compatibility payload remains linked while using the evidence-first Step 2 packet',()=>{
  const payload=buildDiscoveryCapturePayload({
    draft:{meeting_date:'2026-08-31',participants:'Owner, Operations Lead',notes:'Manual intake is slow.',transcript:'Authorized transcript.'},
    company,project,userId:'admin-1',capturedAt:'2026-08-31T20:00:00.000Z'
  });
  assert.equal(payload.status,DISCOVERY_CAPTURE_STATUS);
  assert.equal(payload.company_id,company.id);
  assert.equal(payload.project_id,project.id);
  assert.equal(payload.analysis_packet.version,DISCOVERY_PACKET_VERSION);
  assert.equal(payload.analysis_packet.framework_version,MASTER_DISCOVERY_FRAMEWORK_VERSION);
  assert.equal(payload.analysis_packet.capture.source,'evidence_first_step2');
  assert.equal(payload.analysis_packet.agent.mode,'legacy_capture');
  assert.equal(payload.analysis_packet.claim_types.includes('ADMIN CONTEXT'),true);
  assert.equal(payload.analysis_packet.prohibited_actions.includes('send emails'),true);
});

test('secured diagnosis packet is transcript-optional and preserves all authorized evidence and admin context',()=>{
  const packet=buildDiscoveryPacket({
    draft:{notes:'Constraint'},
    company,project,mode:'secured_execution',
    adminContext:{id:'context-1',content:'Constraint',created_at:'2026-08-31T20:00:00.000Z'},
    evidence:[
      {id:'doc-1',file_name:'orders.xlsx',mime_type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',category:'Measurement'},
      {id:'doc-2',file_name:'workflow.png',mime_type:'image/png',category:'Screenshot'}
    ]
  });
  assert.equal(packet.agent.mode,'secured_execution');
  assert.equal(packet.transcript_text,null);
  assert.equal(packet.admin_context.id,'context-1');
  assert.equal(packet.evidence_manifest.length,2);
  assert.equal(packet.evidence_manifest[0].id,'doc-1');
  assert.equal(packet.required_output.includes('claims'),true);
  assert.equal(packet.required_output.includes('recommended_first_intervention'),true);
});

test('server-captured context wins over an older local browser draft',()=>{
  const chosen=chooseNewestDraft(
    {notes:'old local',updated_at:'2026-08-31T19:00:00.000Z'},
    {updated_at:'2026-08-31T20:00:00.000Z',discovery_notes:'captured server context',analysis_packet:{}}
  );
  assert.equal(chosen.notes,'captured server context');
});
