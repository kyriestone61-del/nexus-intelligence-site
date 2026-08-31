import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISCOVERY_CAPTURE_STATUS,
  buildDiscoveryCapturePayload,
  buildDiscoveryPacket,
  chooseNewestDraft,
  hasDiscoveryContext
} from '../../portal-discovery-capture.js';

const company={id:'company-1',name:'Acme',industry:'Services',website:'https://example.test'};
const project={id:'project-1',name:'Opportunity Assessment',service_type:'Assessment'};

test('capture requires a company, active project, administrator, and meaningful context',()=>{
  assert.equal(hasDiscoveryContext({notes:'Observed a manual handoff.'}),true);
  assert.equal(hasDiscoveryContext({notes:'   '}),false);
  assert.throws(()=>buildDiscoveryCapturePayload({draft:{notes:'Context'},company,userId:'admin-1'}),/active engagement project/i);
  assert.throws(()=>buildDiscoveryCapturePayload({draft:{},company,project,userId:'admin-1'}),/meeting context/i);
});

test('capture payload is an admin-only diagnosis draft linked to company and engagement',()=>{
  const payload=buildDiscoveryCapturePayload({
    draft:{meeting_date:'2026-08-31',participants:'Owner, Operations Lead',notes:'Manual intake is slow.',transcript:'Authorized transcript.'},
    company,project,userId:'admin-1',capturedAt:'2026-08-31T20:00:00.000Z'
  });
  assert.equal(payload.status,DISCOVERY_CAPTURE_STATUS);
  assert.equal(payload.company_id,company.id);
  assert.equal(payload.project_id,project.id);
  assert.equal(payload.analysis_packet.capture.source,'meeting_record');
  assert.equal(payload.analysis_packet.agent.mode,'captured_context');
  assert.equal(payload.analysis_packet.prohibited_actions.includes('send emails'),true);
});

test('secured diagnosis packet preserves the captured meeting context',()=>{
  const packet=buildDiscoveryPacket({
    draft:{meeting_date:'2026-08-31',participants:'Owner',notes:'Constraint',transcript:'Evidence'},
    company,project,mode:'secured_execution',evidence:[{id:'doc-1',file_name:'transcript.txt',category:'Discovery Transcript'}]
  });
  assert.equal(packet.agent.mode,'secured_execution');
  assert.equal(packet.meeting.date,'2026-08-31');
  assert.equal(packet.discovery_notes,'Constraint');
  assert.equal(packet.evidence_manifest[0].id,'doc-1');
  assert.equal(packet.required_output.includes('client_action_items'),true);
});

test('server-captured context wins over an older local browser draft',()=>{
  const chosen=chooseNewestDraft(
    {notes:'old local',updated_at:'2026-08-31T19:00:00.000Z'},
    {updated_at:'2026-08-31T20:00:00.000Z',discovery_notes:'captured server context',analysis_packet:{}}
  );
  assert.equal(chosen.notes,'captured server context');
});
