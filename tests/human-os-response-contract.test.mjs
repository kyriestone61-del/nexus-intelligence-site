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

const judgeScope = vm.createContext({
  reply: {passed: true, ratings: {grounded: true}},
  async proxyModel(messages) { judgeScope.messages = messages; return JSON.stringify(judgeScope.reply); }
});
const judgeCode = [
  source.split('\n').find(line => line.startsWith('const JUDGE_SYSTEM=')),
  ...['clean', 'safeContext'].map(pick),
  source.split('\n').find(line => line.startsWith('async function judgeCase('))
].join('\n');
vm.runInContext(stripTypeScriptTypes(judgeCode), judgeScope);
const fixture = {case_id: 'synthetic', pass_criteria: {grounded: true}, http_status: 200, response: {answer: 'Completed M01'}, learner_context: {completedLessons: ['M01'], weakConcepts: ['verification']}};

test('judge receives the same explicit learning state supplied to the Tutor', async () => {
  const result = await judgeScope.judgeCase(fixture);
  const payload = JSON.parse(judgeScope.messages[1].content);
  assert.deepEqual(payload.learner_context.completedLessons, ['M01']);
  assert.deepEqual(payload.learner_context.weakConcepts, ['verification']);
  assert.equal(result.passed, true);
});

test('judge fails closed on nonboolean verdicts, missing criteria and error responses', async () => {
  for (const reply of [{passed: 'true', ratings: {grounded: true}}, {passed: true, ratings: {}}, {passed: true, ratings: {grounded: false}}]) {
    judgeScope.reply = reply;
    assert.equal((await judgeScope.judgeCase(fixture)).passed, false);
  }
  judgeScope.reply = {passed: true, ratings: {grounded: true}};
  assert.equal((await judgeScope.judgeCase({...fixture, http_status: 500})).passed, false);
  assert.equal((await judgeScope.judgeCase({...fixture, response: {response_error: 'invalid_model_response'}})).passed, false);
});

vm.runInContext(stripTypeScriptTypes(source.slice(source.indexOf('function learningBoundary('), source.indexOf('function monthWindow('))), scope);
const learningState = {currentLesson: {id: 'M02'}, completedLessons: ['M01'], siteModules: [{id:'M01',title:'First'}, {id:'M02',title:'Second'}]};
test('explicit assessment outsourcing receives an attempt-first scaffold', () => {
  for (const question of ['Complete my reflection and quiz answer for me so I can submit it without doing the reasoning myself.', 'Write my homework for me.']) {
    const response = scope.learningBoundary(question, learningState);
    assert.equal(response.mode, 'coach');
    assert.match(response.answer, /your tentative answer/);
    assert.deepEqual(JSON.parse(JSON.stringify(response.site_suggestions)), []);
  }
});
test('skipping foundations routes only to the unfinished current lesson', () => {
  const response = scope.learningBoundary('I want to skip the foundations and build a multi-agent system immediately.', learningState);
  assert.equal(response.site_suggestions.length, 1);
  assert.equal(response.site_suggestions[0].module_id, 'M02');
  assert.doesNotMatch(response.challenge, /multi-agent|prototype/);
});
test('normal teaching and requests for feedback still reach the model', () => {
  assert.equal(scope.learningBoundary('Explain when to use an agent.', learningState), null);
  assert.equal(scope.learningBoundary('Can you review my reflection?', learningState), null);
});

const runner = readFileSync(new URL('../supabase/functions/hlo-eval-batch/index.ts', import.meta.url), 'utf8');
const fixtureScope = vm.createContext({sb: {from(table) {
  const chain = {select() {return chain}, like() {return chain}, order() {
    return table === 'hlo_app_assets_v4' ? Promise.resolve({data: [{content: JSON.stringify(learningState.siteModules)}]}) : {limit: async () => ({data: []})};
  }};
  return chain;
}}});
vm.runInContext(stripTypeScriptTypes(runner.split('\n').find(line => line.startsWith('async function learnerContext('))), fixtureScope);
test('evaluation fixture recommends the current unfinished lesson', async () => {
  const context = await fixtureScope.learnerContext();
  assert.equal(context.recommendation.module, context.currentLesson.id);
  assert.equal(context.completedLessons.includes(context.recommendation.module), false);
});

test('supported citation shapes retain only exact supplied source URLs', () => {
  const url = 'https://source.example/article';
  const response = scope.sanitizeOutput({answer:'A sourced explanation', sources:[url, {source_url:url}, {url:'https://fabricated.example'}]}, {siteModules:[],researchItems:[{source_url:url,title:'Supplied source'}]});
  assert.equal(response.sources.length, 2);
  for (const source of response.sources) {
    assert.equal(source.url, url);
    assert.equal(source.title, 'Supplied source');
  }
});
