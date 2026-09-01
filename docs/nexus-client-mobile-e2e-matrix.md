# Nexus Client Shell — Mobile E2E Certification Matrix

## Certification doctrine

A client-facing release is not considered mobile-ready merely because CSS contains responsive breakpoints. The client shell must preserve the same action state, navigation hierarchy, privacy boundary, and focus behavior on every supported viewport.

### Supported device classes

| Class | Reference viewport | Browser target | Input mode |
| --- | ---: | --- | --- |
| Small iPhone | 375 × 812 | iOS Safari | Touch |
| Current iPhone | 390 × 844 | iOS Safari | Touch |
| Large iPhone | 430 × 932 | iOS Safari | Touch |
| Small Android | 360 × 800 | Android Chrome | Touch |
| Standard Android | 412 × 915 | Android Chrome | Touch |
| Tablet portrait | 768 × 1024 | Safari / Chrome | Touch |
| Desktop sanity | 1440 × 900 | Chromium / Safari | Mouse + keyboard |

## Global acceptance criteria

- No horizontal page scrolling at any supported viewport.
- Interactive targets are at least 44 CSS px high on phone breakpoints.
- Inputs use 16 px phone font sizing to prevent iOS focus zoom.
- Bottom-fixed controls and drawers respect `env(safe-area-inset-bottom)`.
- Forms collapse to one column at phone width.
- Tables or wide content never expand the page viewport; use stacked cards or contained horizontal scrolling only where unavoidable.
- Home, Inbox, Guide, and Progress show the same canonical dependency state for every task.
- `UPCOMING` tasks are visually muted and have no actionable CTA.
- Only one Home task is rendered as `YOUR NEXT STEP`.
- Client navigation contains only Home, Files, Reports, Progress, Help.
- Inbox remains a header utility, not a sixth primary destination.
- Dialogs trap Tab/Shift+Tab, close on Escape when a hardware keyboard is present, and restore focus to their trigger.

## View-by-view matrix

| Surface | iOS Safari | Android Chrome | Required checks |
| --- | --- | --- | --- |
| Home | Required | Required | One primary card; collapsed `UP NEXT`; primary CTA >=44 px; Nexus-working panel does not become client action; no overlap with Guide button. |
| Files | Required | Required | Guidance cards stack; category groups expand/collapse; request CTA is full width on phone; file input usable; redaction copy wraps; secure upload stays within viewport. |
| Reports | Required | Required | Only released reports; sections wrap; nested report values do not overflow; no internal diagnosis fields appear. |
| Progress | Required | Required | Now/Next/Done visually distinct; Next rows are non-clickable; dependency trigger wraps; metrics stack; milestones remain legible. |
| Help | Required | Required | FAQ controls >=44 px where actionable; notification settings fit one column; Ask Nexus launches Guide without viewport jump. |
| Inbox drawer | Required | Required | Full-width phone drawer; Needs action / Updates tabs; badge count visible; drawer scroll isolated from page; closing restores trigger focus. |
| Nexus Guide | Required | Required | Full-width phone drawer; chat body independently scrolls; quick actions stack; input is 16 px; safe-area bottom preserved. |
| Task modal | Required | Required | Fits within `100dvh`; internal scroll only; no background scroll; first focusable receives focus; Tab cycle contained; close restores original task trigger. |
| Approval modal | Required | Required | Decision buttons remain reachable; long decision copy wraps; reject/change note usable; focus trap and restoration work. |

## Dependency-state scenarios

1. **No dependency:** client task is `WAITING_ON_YOU`; eligible for Home primary / UP NEXT and Inbox.
2. **One incomplete Nexus parent:** client task is `UPCOMING`; visible only in Progress > Next; no Home/Inbox CTA.
3. **Multi-hop complete chain:** client task becomes `WAITING_ON_YOU` only after every ancestor is complete.
4. **Missing parent:** task stays `UPCOMING`; UI states that a required prerequisite is unresolved.
5. **Cycle:** every task in the cycle remains `UPCOMING`; no action surface is allowed to present it as executable.
6. **Submitted client task:** task leaves current action queue and becomes Nexus working/review state until explicitly returned or completed.

## Notification rollup scenarios

- Five financial evidence requests display as one `Financial pilot information requested` group with item/completion counts.
- Task notification duplicates do not create a second client action if the task already appears through its task record.
- Document-request notification duplicates do not create an additional standalone Inbox card.
- Non-actionable updates stay in Updates and never inflate the Needs action count.

## Report isolation scenarios

- Draft release record: never client-visible.
- Revoked release record: blocked by RLS and never client-visible.
- Released report with accidental internal top-level keys: serializer removes them.
- Released report with accidental nested review/agent/scoring keys: recursive serializer removes them.
- `nexus_diagnosis_runs` remains inaccessible to client members through RLS.

## Release evidence required

A production sign-off should include:

1. `Nexus QA` green on the release SHA.
2. `Nexus Client Shell Refactor QA` green on the release SHA.
3. Perspective-switcher QA green so admin/client preview authorization was not regressed.
4. Cloudflare Pages deployment green for the same SHA.
5. Real Moon Wax dependency RPC check proving future access/approval tasks remain `UPCOMING` until their Nexus parents complete.
6. At least one authenticated real-device or remote-device pass on iOS Safari and Android Chrome before claiming physical-browser certification. Static contract tests and Chromium emulation do not constitute native Safari/Chrome device certification.
