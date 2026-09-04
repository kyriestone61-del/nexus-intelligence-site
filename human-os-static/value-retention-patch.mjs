import { readFile, writeFile } from 'node:fs/promises';

const path='dist/index.html';
let html=await readFile(path,'utf8');

const required=[
  'Start free. Grow into a deeper operating system.',
  'Advanced personalization, persistent practice and deeper AI support.',
  '<li>Expanded Tutor usage</li>',
  '<li>Advanced personalized curricula</li>',
  '<li>Saved labs and evidence</li>',
  '<li>Progress analytics</li>',
  '<li>Advanced missions and programs</li>',
  '<section class="marketing-section trust-panel">'
];
for(const marker of required){
  if(!html.includes(marker)) throw new Error(`Human OS value patch target missing: ${marker}`);
}

html=html
  .replace(
    '<h2>Start free. Grow into a deeper operating system.</h2>',
    '<h2>Start free. Keep growing with a system that adapts with you.</h2><p>Free lets you experience the Human OS method. Human OS+ is for learners who want their path, Tutor context, evidence and next actions to keep compounding over time.</p>'
  )
  .replace(
    '<p class="muted">Advanced personalization, persistent practice and deeper AI support.</p>',
    '<p class="muted">Ongoing guidance for people who want Human OS to keep adapting as their goals, capability and AI environment change.</p>'
  )
  .replace('<li>Expanded Tutor usage</li>','<li>Expanded context-aware Tutor usage</li>')
  .replace('<li>Advanced personalized curricula</li>','<li>Living Learning Path recalibration</li>')
  .replace('<li>Saved labs and evidence</li>','<li>Saved labs, missions and evidence history</li>')
  .replace('<li>Progress analytics</li>','<li>Progress and next-action intelligence</li>')
  .replace('<li>Advanced missions and programs</li>','<li>Advanced missions plus current AI research context</li>')
  .replace('>Join With a Free Account</button>','>Unlock Human OS+</button>')
  .replace(
    'Founding Human OS+ is $29/month. Checkout remains disabled until commerce QA passes; you will review price and subscription terms before any charge.',
    'Founding Human OS+ is $29/month. The paid value is continuity: your path, Tutor context, evidence and recommendations become more useful as your learning history grows. Checkout remains disabled until commerce QA passes.'
  );

const continuity=`<section class="marketing-section" id="plus-continuity"><div class="section-heading"><div class="eyebrow">Why Human OS+ is recurring</div><h2>Your goals change. AI changes. Your learning system should change with them.</h2><p>Human OS+ is not a monthly fee for a static course library. It is the continuity layer that keeps your learning state useful over time.</p></div><div class="grid two"><div class="card"><h3>Living Learning Path</h3><p class="muted">When your priorities change or your evidence shows a new weakness, Human OS can recalibrate what you should work on next without erasing your history.</p></div><div class="card"><h3>Context-aware Tutor</h3><p class="muted">The Tutor can work from your current lesson, capability level, weak concepts, missions, saved labs and recommended next action instead of starting from a blank chat.</p></div><div class="card"><h3>Evidence that compounds</h3><p class="muted">Labs, missions, mastery and progress create a growing record of what you have applied and demonstrated—not just what content you opened.</p></div><div class="card"><h3>Current AI intelligence</h3><p class="muted">Human OS maintains research and frontier signals so learning can stay connected to what is changing in AI, automation and robotics rather than freezing at course-publish time.</p></div></div><p class="muted small" style="margin-top:14px">Founding Human OS+ is $29/month. Broad paid launch remains gated on commerce, entitlement, Tutor, security and retention QA.</p></section>`;
html=html.replace('<section class="marketing-section trust-panel">',`${continuity}<section class="marketing-section trust-panel">`);

await writeFile(path,html,'utf8');
console.log('Human OS recurring-value and retention positioning applied to static candidate.');
