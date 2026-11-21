# Human OS Static Release

This directory builds the source-controlled Human OS Vercel candidate used by PR #96.

Release requirements:

- all pinned frontend assets must match their recorded SHA-256 values;
- mission-critical frontend CSS and JavaScript must be localized in the generated static output;
- the preview build routes AI Tutor traffic to the evaluated AI-era Tutor candidate (`hlo-tutor-stream`), while production remains unchanged until the release gate passes;
- public Terms, Privacy, robots.txt and sitemap.xml surfaces must exist;
- the candidate must not be promoted until Vercel preview, authenticated/mobile regression, Human OS Stripe E2E, AI Guide evaluation and trust gates pass.

See `docs/human-os-marketing-readiness.md` for the canonical gate register.
