import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=await fs.readFile(new URL('../../supabase/functions/_shared/relystra-diagnosis-budget.ts',import.meta.url),'utf8');
const {diagnosisReportBudget}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('Full Diagnosis allows observed provider latency while preserving the total execution ceiling after evidence preparation',()=>{
 assert.equal(diagnosisReportBudget(1000,1000),130000);
 assert.equal(diagnosisReportBudget(1000,41000),90000);
 assert.equal(diagnosisReportBudget(1000,126000),5000);
 assert.throws(()=>diagnosisReportBudget(1000,126001),/DIAGNOSIS_PREPARATION_TIMEOUT/);
});
