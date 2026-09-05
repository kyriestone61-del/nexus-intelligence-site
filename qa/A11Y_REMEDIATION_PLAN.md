# Relystra Portal Accessibility Remediation Plan

The current reset baseline was audited with `qa/scripts/accessibility-static-audit.py`.

## Confirmed baseline findings

The report identified **35 form controls without explicit accessible label associations**, plus modal shells without `role="dialog"`, modal shells without `aria-modal="true"`, and no obvious skip-to-main contract.

Affected control IDs reported by CI:

`signInEmail`, `signInPassword`, `createName`, `createCompany`, `createWebsite`, `createEmail`, `createPassword`, `onboardCompany`, `onboardWebsite`, `onboardIndustry`, `docFile`, `docCategory`, `docNote`, `taskTitle`, `taskAssignee`, `taskPriority`, `taskDue`, `taskDescription`, `metricName`, `metricUnit`, `metricBaseline`, `metricCurrent`, `metricTarget`, `metricMethod`, `milestoneTitle`, `milestoneStart`, `milestoneDue`, `milestoneStatus`, `milestoneDescription`, `requestDocTitle`, `requestDocPurpose`, `requestDocExamples`, `requestDocPrivacy`, `requestDocSensitivity`, `requestDocDue`.

## Required reset acceptance

1. Every form control above must have an explicit accessible name using `label[for]`, `aria-label`, or `aria-labelledby`.
2. Every Relystra modal must expose dialog semantics and a usable accessible name.
3. Opening a modal must move focus into it; closing must restore focus to the trigger.
4. Escape closes non-destructive dialogs unless a required blocking decision explicitly prevents dismissal.
5. A keyboard-accessible Skip to main content link must target the actual workspace main region.
6. Dynamic success/error states must use appropriate live-region semantics.
7. All critical admin/client workflows must remain keyboard operable.
8. The final reset branch should run the static accessibility audit with strict enforcement and browser-level keyboard/focus tests.

## Remediation helper

`qa/scripts/remediate_portal_accessibility.py` provides a conservative, idempotent starting point for the static HTML portion. It:

- connects a visual `<label>` to the immediately following control when the pair is already structurally adjacent;
- adds dialog semantics to `.modal` shells that do not already define them;
- adds a skip link and a stable main-content target.

The helper is **not** a substitute for behavioral focus-management QA. It should be run/reviewed only after the reset HTML stabilizes.
