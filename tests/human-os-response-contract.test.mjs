import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../supabase/functions/hlo-tutor-stream/index.ts', import.meta.url), 'utf8');
const pick = name => source.split('\n').find(line => line.startsWith(`function ${name}(`));
const code = [source.split('\n').find(line => line.startsWith('const ALLOWED_VIEWS=')), ...['clean', 'fallback', 'sanitizeOutput'].map(pick)].join('\n');
const scope = vm.createContext({});
vm.runInContext(stripTypeScriptTypes(code), scope);
const sanitize = value => JSON.parse(JSON.stringify(scope.sanitizeOutput(value, { siteModules: [], researchItems: [] })));

test('structured answer is rejected without exposing object placeholders or claiming success', () => {
  const result = sanitize({answer: {explanation: 'Nested answer'}, challenge: {task: 'Nested task'}});
  assert.equal(result.response_error, 'invalid_model_response');
  assert.equal(result.mode, 'redirect');
  assert.match(result.answer, /try your question again/);
  assert.doesNotMatch(JSON.stringify(result), /\[object Object\]/);
});

test('valid answer survives while malformed optional text is omitted', () => {
  const result = sanitize({answer: 'Use automation for explicit rules.', challenge: {task: 'Nested'}, check_for_understanding: ['Wrong shape'], suggested_questions: [{question: 'Wrong shape'}, 'What changes with ambiguity?']});
  assert.equal(result.answer, 'Use automation for explicit rules.');
  assert.equal(result.challenge, '');
  assert.equal(result.check_for_understanding, '');
  assert.deepEqual(result.suggested_questions, ['What changes with ambiguity?']);
});

test('empty, missing, array and numeric answers fail explicitly', () => {
  for (const answer of [undefined, null, '', '   ', [], 42, false]) {
    assert.equal(sanitize({answer}).response_error, 'invalid_model_response');
  }
});

test('well-formed instructional text and existing route/source filtering survive', () => {
  const result = sanitize({answer: 'A useful answer', challenge: 'Try one workflow.', check_for_understanding: 'Why?', site_suggestions: [{view: 'invented'}], sources: [{url: 'https://invented.example'}]});
  assert.equal(result.challenge, 'Try one workflow.');
  assert.equal(result.check_for_understanding, 'Why?');
  assert.deepEqual(result.site_suggestions, []);
  assert.deepEqual(result.sources, []);
});
