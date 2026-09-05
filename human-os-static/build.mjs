import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';

const EDGE = 'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app';
const SOURCE_INDEX = 'https://raw.githubusercontent.com/kyriestone61-del/nexus-intelligence-site/25d35b419272425ae840ed8945658bcfb0aece7f/human-leverage-rebuild/index.html';
const ORIGIN = 'https://human-leverage-os.vercel.app';

// Snapshot hashes captured from public.hlo_app_assets_v4 on 2026-09-03.
// A changed upstream asset fails the build instead of silently shipping drift.
const ASSETS = {
  'academy-overrides-01.json':'0b0817d5a5816e44d24ef2a0930c2a7ba72cc4d1fb0412d9eec80f3489819f08',
  'academy-overrides-02.json':'df357294660361d1e557ede51109462a1656a0b2d27b44c4c9887f0a4b628407',
  'academy.js':'97d9bf4941c7735a7f55db61ba714bb9ac01db16450663841eb7d0126543b852',
  'analytics.js':'5994c9cc7400345b6284bdb16878f048be0551aeefa32acfda380a151f6d9606',
  'app.js':'0eabd4fb2b2a49e142c80594637699b2ee3945e3e7571d852c7f894a9c32c849',
  'attention.css':'4ecf1dca464cc69cf80b7f3553f405a95ebbf656e5b2561653b2cc3589c7632b',
  'attention.js':'c33b3580ae7b3e437e1d8589e49eb012b2a05aacab9aeec0e0e5066ac676e5ef',
  'auth.js':'dbda257050e8b580cf0801d6c58f1ddf23f401f8be4f723cc4b12324aec5a08a',
  'baseline.js':'b8e45e6b6d03fc5804c0f8ac61f7077e983b197b3c9f444af8a70c1eddc51a64',
  'capability.js':'3f4d57de6ba7f63ad38640cd8e3ac9fa0444d557bc8a8af95eee94b19798c3e6',
  'core.js':'55b9d4be332ac40da3915c627af33dd80a8e363a385212f8ed7c968bc48d03d5',
  'dashboard.js':'0d5cb779df0093958c7776727d5e19391ccb2c8e7697cc18b0399dd3cacbf7f9',
  'experience-v2.js':'bdb79a6f4b28490d79e7d03619b47ddf9082372f2c3b6379aafe06b33d9a470d',
  'guided-tour.css':'26224a160d291b8caaa3b9d1401daaad6dc91d1a0ba9738c6644a440bfc85b7e',
  'guided-tour.js':'21f9518dd965d2f2592f79cd7cf3973599b44a8aef123f590e0b59203f9e383f',
  'learning.js':'04be95c3c33770fbe328bf958334d6cc74b4aa06945bcf680e436be50ced2652',
  'leverage-v2.js':'9445f4db11d65cd5f694d1d5f070317cbded28739155f73c7afc3b0e67e94ca3',
  'mobile-fixes.css':'6f10b05dac388e398a2ba13a43b56b06db7a6af01b7d2164364bf3f9304a1be1',
  'modules-01.json':'07cd437f44e43b3efb4650087e591d72eb371e8df361e39f7395a11ca11f5d1e',
  'modules-02.json':'b616dc3d1053cfddf0087de9084d636706bfeff61d299558e213990ae0d48596',
  'modules-03.json':'c2c5974c8f553e49462ec81234b00cfec615911c25d4c7656e5259f4f1952d17',
  'modules-04.json':'48c9c37f9ee22ac969a154f3da7803c37b18841b72524798d0fe8dae813aca5b',
  'modules-05.json':'9796a40c4097dc295c701d2cd8339b95c71d9dd3c16b254f203403fe46358079',
  'operations.js':'f985f5166104807f8343b848bc861e9e486a52504532a52142f40791dc03abd3',
  'owner.js':'533fd2e0ba140727a6dce25d276649e10a369c0ccce212742e5320f0f2ff224b',
  'personalize.js':'3e028d04aa8c7f07f03b794ec96891b6be3393e90d72e36b6f3c9944f7791be5',
  'privacy-ui.js':'8cb94ed1330956f7b8f031f9aa2a22c1b4189a83a758b2c86cdb64f982d4b869',
  'strategy.js':'a8ab4941ae57d0836f840c1320fd4a0a76a1d3204b92c9f4a7f745a4f45b3b38',
  'styles.css':'c5f57d3af7c8abd8d386e605d1f4c51a576d6b6cb78d8fa65eb1d8dcde3b9d61',
  'tutor-clear.js':'2eca5338dade91b208f986501fb48790be60c5b2cb4a1ee4aeb38fd65b155af3',
  'tutor-v2.js':'e4221003e78467aed2efee81db0e60ba8a3098b50cc5a3cd3ff38dc443c33d87'
};

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

async function getText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'human-os-static-build/1.0' } });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.text();
}

function localizeJs(text) {
  // Localize frontend asset references only. API/function calls without ?asset= remain on Supabase.
  return text
    .replaceAll(`${EDGE}?asset=`, '/assets/')
    .replaceAll('${CFG.assetBase}?asset=', '/assets/');
}

function policyPage(title, heading, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Human OS</title><meta name="robots" content="index,follow"><link rel="canonical" href="${ORIGIN}/${title.toLowerCase().startsWith('privacy') ? 'privacy' : 'terms'}"><style>body{margin:0;background:#0b0d10;color:#f3f3ef;font:16px/1.7 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:800px;margin:0 auto;padding:64px 24px}a{color:#d6b15f}h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.05}.card{background:#13161a;border:1px solid #2a3037;border-radius:18px;padding:28px}.muted{color:#a8afb7}</style></head><body><main class="wrap"><a href="/">← Human OS</a><h1>${heading}</h1><div class="card"><p>${body}</p></div><p class="muted">Effective notice version: 2026-09-01. This page publishes the same notice presented during Human OS account creation. It should receive final owner/legal review before broad paid acquisition.</p></main></body></html>`;
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist/assets', { recursive: true });
await mkdir('dist/terms', { recursive: true });
await mkdir('dist/privacy', { recursive: true });

for (const [name, expected] of Object.entries(ASSETS)) {
  const raw = await getText(`${EDGE}?asset=${encodeURIComponent(name)}`);
  const actual = sha256(raw);
  if (actual !== expected) throw new Error(`Asset drift for ${name}: expected ${expected}, got ${actual}`);
  const output = name.endsWith('.js') ? localizeJs(raw) : raw;
  await writeFile(`dist/assets/${name}`, output, 'utf8');
}

let html = await getText(SOURCE_INDEX);
html = html
  .replace('__ASSET_BASE__?asset=styles.css', './assets/styles.css')
  .replace('__ASSET_BASE__?asset=app.js', './assets/app.js')
  .replace('__ASSET_BASE__?asset=tutor-clear.js', './assets/tutor-clear.js')
  .replace('>Build My Path</button>', '>Build My Learning Path</button>')
  .replace('<h2>Founding access</h2>', '<h2>$29/month</h2>')
  .replace('Billing will not begin until Human OS+ launches and pricing is clearly presented.', 'Founding Human OS+ is $29/month. Checkout remains disabled until commerce QA passes; you will review price and subscription terms before any charge.')
  .replace('<div><a href="#plans">Plans</a><a href="#how">How it works</a><button id="footerSignIn"', '<div><a href="#plans">Plans</a><a href="#how">How it works</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><button id="footerSignIn"')
  .replace('</head>', '<meta name="robots" content="index,follow"></head>');
await writeFile('dist/index.html', html, 'utf8');

const terms = 'Human OS is an educational learning platform. It does not provide accredited credentials or guarantee employment, business, investment, trading, health, legal or financial outcomes. You remain responsible for consequential decisions, source verification and how you apply the material. Do not upload information you are not authorized to share. Human OS features may change as the product develops.';
const privacy = 'Human OS stores the account and learning information needed to provide the service: profile preferences, curriculum, lesson progress, quiz results, missions, lab drafts, notes, saved sources and Tutor history. Personalization uses information you explicitly provide plus your learning activity. Tutor questions may be processed by configured AI providers to generate instructional responses. Human OS does not use editable profile fields to grant owner/admin authorization. You can export learning data, clear learning history and request account deletion from Account settings.';
await writeFile('dist/terms/index.html', policyPage('Terms', 'Human OS Terms', terms), 'utf8');
await writeFile('dist/privacy/index.html', policyPage('Privacy', 'Human OS Privacy Notice', privacy), 'utf8');
await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`, 'utf8');
await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/terms</loc></url><url><loc>${ORIGIN}/privacy</loc></url></urlset>\n`, 'utf8');

console.log(`Human OS static build complete: ${Object.keys(ASSETS).length} hash-verified assets.`);
