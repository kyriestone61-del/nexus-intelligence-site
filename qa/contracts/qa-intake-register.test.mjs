import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const html=await fs.readFile(new URL('../../delivery/qa-estimate-intake-register/index.html',import.meta.url),'utf8');
const core=html.split('<script>')[1].split('// DOM application begins here.')[0];
const rules=vm.runInNewContext(core+';({validateRecords,parseBackup,backupText,csvText})');
const sample={id:'QA-001',site:'Sample North Site',contact:'qa-contact@example.invalid',scope:'lobby floor cleaning estimate',urgency:'normal',owner:'QA Coordinator',status:'received',due:'2026-09-10',source:'synthetic phone note'};
test('intake JSON round trips both accepted synthetic records without changing fields',()=>{
  const records=[sample,{...sample,id:'QA-002',site:'Sample South Site',contact:'qa-backup@example.invalid',scope:'window cleaning estimate',urgency:'urgent',owner:'QA Reviewer',status:'needs clarification',due:'2026-09-11',source:'synthetic email note'}];
  assert.deepEqual(JSON.parse(JSON.stringify(rules.parseBackup(rules.backupText(records)))),records);
});
test('intake rejects missing, duplicate, malformed and unsupported records before persistence',()=>{
  for(const field of ['id','site','contact','scope','owner'])assert.throws(()=>rules.validateRecords([{...sample,[field]:'  '}]),/Enter/);
  assert.throws(()=>rules.validateRecords([sample,{...sample,id:'qa-001'}]),/Duplicate/);
  for(const patch of [{status:'approved'},{urgency:'automatic'},{due:'2026-02-30'},{due:'tomorrow'},{scope:null},{id:'x'.repeat(81)}])assert.throws(()=>rules.validateRecords([{...sample,...patch}]));
  assert.throws(()=>rules.parseBackup('{bad'));
  assert.throws(()=>rules.parseBackup(JSON.stringify({format:'other',version:1,records:[sample]})));
  assert.throws(()=>rules.validateRecords(Array(1001).fill(sample)),/1,000/);
});
test('intake CSV preserves delimiters and neutralizes spreadsheet formulas',()=>{
  const csv=rules.csvText([{...sample,site:'=HYPERLINK("https://example.invalid")',contact:'+123',owner:'@SUM(1)',scope:'Line one, with comma\nLine "two"'}]);
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.invalid"")"'));
  assert.ok(csv.includes('"\'+123"'));assert.ok(csv.includes('"\'@SUM(1)"'));
  assert.ok(csv.includes('"Line one, with comma\nLine ""two"""'));
});
