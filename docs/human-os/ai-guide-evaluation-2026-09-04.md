# Human OS AI Guide — verified evaluation, September 4, 2026

The AI Guide release gate passed for preview Tutor version 12: **50/50 cases passed, zero critical failures, zero evaluator errors**.

## Verified candidate

- PR: https://github.com/kyriestone61-del/nexus-intelligence-site/pull/96 (draft; not merged).
- Evaluated implementation commit: `0b8c2c6298d2b5e293629f8c61d6e936e089ac52`.
- Subsequent CI configuration commit: `db3465fd22a883d31df7f013152217f0d5eb55bb` (same Tutor and evaluation source).
- Supabase project: `dmdgkjksouhhsuojthav`.
- Preview function: `hlo-tutor-stream`, version 12, JWT verification enabled.
- Deployment hash: `c568a62fc4cc2b26a5d5430592ca0cbf69bc62bf2dbd08b42f675b1679dd7fc1`.
- Evaluation run: `998eda56-467b-44b3-92ac-2756aa631149`.
- Evaluator: `context-aware-single-case-judge-v5`.
- Fixture: `consistent-M02-recommendation-v2`.
- All 50 unique active suite cases are present. Every passing verdict has boolean true for every required criterion, HTTP 200, no response error, and recorded learner context.
- Existing evaluation slot `hlo-v2-preview` version 17 uses `supabase/functions/hlo-eval-batch/index.ts`; its one-shot configuration flag was verified disabled after the run.

## Results

Each family passed 5/5: curriculum grounding, prerequisite routing, productive struggle, difficulty adaptation, site routing, prompt injection, medical boundary, financial boundary, source fidelity, and privacy/personalization.

The unchanged gate requires zero critical failures and at least 48/50 passes.

## Repairs

1. Model objects no longer become “[object Object]” in learner-facing text.
2. The evaluator receives the learning context that was supplied to the Tutor. It no longer judges supported learner-state references without seeing their evidence.
3. The synthetic next-step recommendation now matches unfinished M02, rather than recommending M01 while also marking it complete.
4. Explicit requests to complete assessments receive an attempt-first scaffold without correct-option hints.
5. Requests to skip foundations route to the unfinished current foundation lesson.
6. Citation instructions require supplied source URLs; supported citation shapes retain only exact allowlisted URLs.
7. Eleven behavior regressions now run in CI.

## Retained prior attempts

| Run | Result | Interpretation |
|---|---|---|
| `80d53220-dcea-4af6-92d6-0cc9659b694f` | 39/50; 7 raw critical failures | Inconclusive: the judge omitted the Tutor's learner context. Raw judgments retained. |
| `7fe674fe-df8a-45b6-87f1-9fe2c3dacaee` | 41/50; 1 critical failure | Blocked: assessment scaffolding, prerequisite behavior and missing citation required repairs; routing also exposed an inconsistent fixture. Raw judgments retained. |
| `998eda56-467b-44b3-92ac-2756aa631149` | 50/50; 0 critical failures | Passed with supplied context and consistent fixture. |

The case questions, pass criteria, suite size, and release threshold were not weakened. Each attempt used fresh Tutor responses.

## Validation and remaining launch work

- Tutor regression CI: https://github.com/kyriestone61-del/nexus-intelligence-site/actions/runs/33926847794 — passed, 11 tests.
- Static build CI: https://github.com/kyriestone61-del/nexus-intelligence-site/actions/runs/33926847804 — passed.
- Website preview deployment: https://github.com/kyriestone61-del/nexus-intelligence-site/actions/runs/33926847795 — blocked at “Require Vercel token.”
- Production `hlo-tutor` remains version 10 with unchanged hash `5af102612dfb8a342f921387b5e1d3498a5669ee4dde500fbc055ba6935feee5`.
- No production frontend promotion or merge occurred.

The passing synthetic Tutor gate does not replace authenticated frontend, commerce, or production QA. The website preview still needs its Vercel token. The previously recorded Human OS Stripe connection, leaked-password protection, and Terms/Privacy approval dependencies remain separate launch work; these account settings were not modified in this task.
