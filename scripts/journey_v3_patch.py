from pathlib import Path

ROOT = Path('.')

def replace_required(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Missing expected text in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new))

# ---------------- Public customer journey ----------------
p = ROOT / 'app.js'
app = p.read_text()
app = app.replace("shareUrl(target='/assessment')", "shareUrl(target='/book')")
old_next = """      if(!j.quickScan?.completedAt)return {href:'/quick-scan',label:'Find My AI Opportunities'};\n      if(!j.assessment?.completedAt)return {href:'/assessment',label:'Continue My Diagnostic'};\n      if(!j.booking?.status)return {href:'/book',label:'Book My Fit Call'};"""
new_next = """      if(!j.quickScan?.completedAt)return {href:'/quick-scan',label:'Get My Free AI Snapshot'};\n      if(!j.booking?.status)return {href:'/book',label:'Request My Fit Call'};"""
if old_next not in app:
    raise SystemExit('NexusJourney.next block not found')
app = app.replace(old_next, new_next)
app = app.replace("nav.innerHTML='<a href=\"/services\">Solutions</a><a href=\"/methodology\">How It Works</a><a href=\"/case-studies\">Results</a><a href=\"/about\">About</a><a href=\"/portal\">Client Login</a><a class=\"nav-cta\" data-track=\"nav_quick_scan\" href=\"/quick-scan\">Find My AI Opportunities</a>';",
                  "nav.innerHTML='<a href=\"/services\">Solutions</a><a href=\"/methodology\">How It Works</a><a href=\"/case-studies\">Results</a><a href=\"/about\">About</a><a href=\"/portal\">Client Login</a><a class=\"nav-cta\" data-track=\"nav_quick_scan\" href=\"/quick-scan\">Free AI Snapshot</a>';" )
app = app.replace("const labels={scan:'Opportunity Scan complete',assessment:'Diagnostic complete',booking:j.booking?.status==='confirmed'?'Fit Call confirmed':'Fit Call requested'};",
                  "const labels={scan:'Free AI Snapshot complete',assessment:'Deeper diagnostic complete',booking:j.booking?.status==='confirmed'?'Fit Call confirmed':'Fit Call requested'};")
app = app.replace("bar.innerHTML='<a class=\"btn primary\" href=\"/quick-scan\">Find My AI Opportunities →</a>';",
                  "bar.innerHTML='<a class=\"btn primary\" href=\"/quick-scan\">Get My Free AI Snapshot →</a>';" )
app = app.replace('Book a Fit Call', 'Request a Fit Call').replace('Book My Fit Call', 'Request My Fit Call')

insert_marker = "  // Consent remains opt-in and honors Global Privacy Control."
if insert_marker not in app:
    raise SystemExit('App insertion marker not found')
insert = r'''
  // SMB journey v3: one obvious buying path and simpler buyer language.
  function injectSimpleCustomerJourney(){
    if(path!=='/'||document.getElementById('nxCustomerJourney'))return;
    const hero=document.querySelector('main .hero-section');if(!hero)return;
    const section=document.createElement('section');section.id='nxCustomerJourney';section.className='nx-customer-journey-section';
    section.innerHTML=`<div class="wrap"><div class="nx-journey-shell"><div class="nx-journey-head"><div class="kicker">The simplest way to start</div><h2>One path from curiosity to measurable improvement.</h2><p>You do not need to know which AI tool you need. Start with the business problem and move forward only when the evidence supports the next step.</p></div><div class="nx-journey-steps"><div><span>01</span><b>Free AI Snapshot</b><small>Five minutes to identify the strongest opportunities.</small></div><i>→</i><div><span>02</span><b>Request a Fit Call</b><small>Confirm whether the problem is worth investigating together.</small></div><i>→</i><div><span>03</span><b>Paid Opportunity Assessment</b><small>Establish the real workflow, baseline, risk, and priority.</small></div><i>→</i><div><span>04</span><b>Implement</b><small>Build the smallest controlled solution that is justified.</small></div><i>→</i><div><span>05</span><b>Measure & Improve</b><small>Compare the result to the baseline and expand only when it works.</small></div></div><div class="actions"><a class="btn primary" href="/quick-scan">Get My Free AI Snapshot →</a><a class="btn secondary" href="/book">Request a Fit Call</a></div></div></div>`;
    hero.insertAdjacentElement('afterend',section);
  }

  function simplifyQuickScanHandoff(){
    if(path!=='/quick-scan')return;
    let tries=0;
    const patch=()=>{
      tries++;
      const root=document.getElementById('snapshotBody');
      if(root){
        root.querySelectorAll('a[href="/assessment"]').forEach(a=>{
          a.href='/book';
          if(/diagnostic|deeper|continue|assessment/i.test(a.textContent||''))a.textContent='Request a 20-Minute Fit Call →';
        });
        root.querySelectorAll('a[href="/book"]').forEach(a=>{
          if(/book/i.test(a.textContent||''))a.textContent=(a.textContent||'').replace(/Book/gi,'Request');
        });
      }
      if(tries<24)setTimeout(patch,750);
    };
    patch();
  }

  function simplifyAssessmentPositioning(){
    if(path!=='/assessment'||document.getElementById('nxOptionalDiagnostic'))return;
    const hero=document.querySelector('main .wrap.hero');if(!hero)return;
    const note=document.createElement('div');note.id='nxOptionalDiagnostic';note.className='nx-optional-diagnostic';
    note.innerHTML='<b>Optional deeper diagnostic.</b><span>The Free AI Snapshot is enough to request a Fit Call. Use this page only when you want to provide more operating detail before the conversation.</span><a class="btn secondary" href="/book">Request a Fit Call →</a>';
    hero.appendChild(note);
  }

  function simplifyFitCallExperience(){
    if(path!=='/book'||document.getElementById('nxFitCallGuide'))return;
    document.title='Request a Nexus Fit Call | Nexus Intelligence';
    const hero=document.querySelector('main .wrap.hero');if(!hero)return;
    const eyebrow=hero.querySelector('.eyebrow');if(eyebrow)eyebrow.textContent='20-minute Nexus Fit Call';
    const h1=hero.querySelector('h1');if(h1)h1.innerHTML='Request a conversation.<br><span class="grad">Keep the process simple.</span>';
    const p=hero.querySelector('p');if(p)p.textContent='Tell Nexus what you want to improve, choose a preferred time, and submit the request. Your time is not considered confirmed until the calendar invitation is sent.';
    const guide=document.createElement('div');guide.id='nxFitCallGuide';guide.className='nx-fit-call-guide';
    guide.innerHTML='<div><span>1</span><b>Confirm your details</b><small>We carry forward your Snapshot when available.</small></div><div><span>2</span><b>Choose a preferred time</b><small>This is a request, not a false confirmation.</small></div><div><span>3</span><b>Receive the invitation</b><small>The meeting becomes confirmed when Nexus sends the calendar invite.</small></div>';
    hero.appendChild(guide);
  }

  function simplifySecurityPortalLanguage(){
    if(path!=='/security')return;
    document.querySelectorAll('p').forEach(p=>{
      if(/The portal is being built as an authenticated business workspace/i.test(p.textContent||''))p.textContent='The Nexus Client Portal is an authenticated business workspace, not a public document dropbox.';
    });
  }
'''
app = app.replace(insert_marker, insert + '\n' + insert_marker)
call_marker = "  markActiveNavigation();\n"
if call_marker not in app:
    raise SystemExit('App call marker not found')
app = app.replace(call_marker, "  injectSimpleCustomerJourney();\n  simplifyQuickScanHandoff();\n  simplifyAssessmentPositioning();\n  simplifyFitCallExperience();\n  simplifySecurityPortalLanguage();\n" + call_marker)
p.write_text(app)

# ---------------- Client portal simplification ----------------
p = ROOT / 'portal-simplify.js'
portal = p.read_text()
portal = portal.replace(
"    : '<b>CLIENT ACCOUNT · YOUR RESPONSIBILITIES</b><span>Provide requested information, complete actions assigned to you, ask Nexus for help or changes, and make approval decisions. Nexus manages the delivery system.</span>';",
"    : '<b>CLIENT ACCOUNT · KEEP IT SIMPLE</b><span>Your workspace answers four questions: What does Nexus need from me? What do I need to decide? What is Nexus doing? What changed in my business?</span>';"
)
nav_insert_after = """function simplifyNavigation(admin){\n  if(admin){\n    navLabel('command','Command Center');navLabel('clients','Clients');navLabel('overview','Client Today');navLabel('tasks','Action Items');navLabel('requests','Client Requests');navLabel('approvals','Approvals to Send');navLabel('automations','Automations');navLabel('metrics','Improvements');navLabel('timeline','Projects');navLabel('documents','Files & Information');navLabel('activity','Activity');\n  }else{\n    navLabel('overview','Today');navLabel('requests','Ask Nexus');navLabel('approvals','Decisions');navLabel('tasks','My Actions');navLabel('automations','Systems');navLabel('metrics','Results');navLabel('timeline','Delivery Plan');navLabel('documents','Files & Information');navLabel('notifications','Alerts');\n  }\n}\n"""
if nav_insert_after not in portal:
    raise SystemExit('Portal navigation block not found')
group_func = r'''
function groupClientNavigation(admin){
  const nav=document.querySelector('.side-nav');if(!nav)return;
  const existing=$('portalClientNavGroups');
  if(admin){
    if(existing){
      existing.querySelectorAll('button[data-section]').forEach(b=>nav.appendChild(b));
      existing.remove();
    }
    const activity=nav.querySelector('button[data-section="activity"]');if(activity)activity.style.display='';
    return;
  }
  if(existing)return;
  const bySection=s=>nav.querySelector(`button[data-section="${s}"]`);
  const groups=[
    ['Today',['overview']],
    ['Work With Nexus',['tasks','approvals','requests']],
    ['Project',['timeline','automations']],
    ['Files & Information',['documents']],
    ['Results',['metrics','notifications']]
  ];
  const shell=document.createElement('div');shell.id='portalClientNavGroups';shell.className='portal-client-nav-groups';
  groups.forEach(([label,sections])=>{
    const group=document.createElement('div');group.className='portal-client-nav-group';
    const heading=document.createElement('div');heading.className='portal-client-nav-heading';heading.textContent=label;group.appendChild(heading);
    sections.forEach(section=>{const b=bySection(section);if(b)group.appendChild(b)});
    shell.appendChild(group);
  });
  const activity=bySection('activity');if(activity)activity.style.display='none';
  nav.prepend(shell);
}
'''
portal = portal.replace(nav_insert_after, nav_insert_after + group_func)
portal = portal.replace("if(intro)setText(intro,admin?'Request, review, and download the information needed to diagnose and deliver the engagement.':'This page has one job: show you what Nexus needs and give you a simple place to provide it.');",
                        "if(intro)setText(intro,admin?'Request, review, and download the information needed to diagnose and deliver the engagement.':'Use this simple checklist to give Nexus what it needs. Provide what you already have; if something does not exist, choose Build with Nexus.');")
portal = portal.replace("      : 'Work down the checklist. For each item, <b>upload it</b>, <b>answer in the portal</b>, choose <b>Build with Nexus</b>, or mark it <b>Not applicable</b>. You do not need perfect documentation.');",
                        "      : 'For each item, choose one action: <b>Upload</b>, <b>Answer here</b>, <b>Build with Nexus</b>, or <b>Not applicable</b>. That is all you need to do.');")
friend_insert = """  const prepSection=[...section.querySelectorAll('.secure-doc-section')].find(x=>x.querySelector('#dataRoomRequirements'));\n"""
if friend_insert not in portal:
    raise SystemExit('Portal data room insertion point missing')
friendly = r'''
  if(!admin){
    const friendlyTitles={
      'Current workflow or SOP':'How this work is done today',
      'Representative examples of the work':'3–10 real examples',
      'Systems and tools list':'Tools your team uses',
      'Volume and frequency':'How often this happens',
      'Existing KPI or performance report':'Any reports or numbers you already track',
      'Process owners and decision makers':'Who does the work and who approves changes'
    };
    section.querySelectorAll('.requirement-card').forEach(card=>{
      const title=[...card.querySelectorAll('h2,h3,h4,b')].find(el=>friendlyTitles[(el.textContent||'').trim()]);
      if(title)setText(title,friendlyTitles[(title.textContent||'').trim()]);
    });
  }

'''
portal = portal.replace(friend_insert, friendly + friend_insert)
portal = portal.replace("ensureRoleGuide(admin);simplifyNavigation(admin);simplifyControls(admin);simplifySectionCopy(admin);simplifyDataRoom(admin);",
                        "ensureRoleGuide(admin);simplifyNavigation(admin);groupClientNavigation(admin);simplifyControls(admin);simplifySectionCopy(admin);simplifyDataRoom(admin);")
p.write_text(portal)

# Portal styling for five-group client navigation.
p = ROOT / 'portal-simplify.css'
css = p.read_text()
css += r'''
.portal-client-nav-groups{display:grid;gap:13px}.portal-client-nav-group{display:grid;gap:4px}.portal-client-nav-heading{padding:0 10px 4px;color:var(--nx-muted);font-size:9px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.portal-client-nav-group .side-nav,.portal-client-nav-group button{width:100%}.portal-client-mode .side-nav #portalClientNavGroups button{padding-left:18px}.portal-client-mode .side-nav #portalClientNavGroups .portal-client-nav-group:has(button.active) .portal-client-nav-heading{color:var(--nx-citron)}
.portal-client-mode #section-documents .requirement-card h3,.portal-client-mode #section-documents .requirement-card h2{font-size:18px;line-height:1.2}.portal-client-mode #section-documents .req-actions .btn{min-height:42px}.portal-client-mode #section-documents .data-room-hero p{max-width:820px}
'''
p.write_text(css)

# ---------------- Industries page: remove client-adjacent name and simplify ----------------
industries = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Industries & Business Types | Nexus Intelligence</title>
<meta name="description" content="See which small and mid-sized businesses may benefit from Nexus Intelligence based on workflow repetition, measurable friction, digital information, and decision ownership.">
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/simple-site.css">
</head>
<body>
<header class="site-header"><div class="wrap"><nav><a class="brand" href="/"><span class="mark">N</span><span>Nexus Intelligence</span></a><button class="menu-btn" aria-label="Open navigation" aria-expanded="false">Menu</button><div class="navlinks"><a href="/services">Solutions</a><a href="/methodology">How It Works</a><a href="/case-studies">Results</a><a href="/about">About</a><a href="/portal">Client Login</a><a class="nav-cta" href="/quick-scan">Free AI Snapshot</a></div></nav></div></header>
<main>
<div class="wrap hero"><div class="eyebrow">Industries & business types</div><h1>Workflow fit matters more<br><span class="grad">than the industry label.</span></h1><p>Nexus works best with small and mid-sized businesses that have repeatable work, measurable friction, useful information already living in business systems, and a manager or owner who can approve operational change.</p><div class="actions"><a class="btn primary" href="/quick-scan">Get My Free AI Snapshot →</a><a class="btn secondary" href="/book">Request a Fit Call</a></div></div>
<section><div class="wrap"><div class="section-head"><div><div class="kicker">Strong-fit business types</div><h2>Common environments where Nexus can investigate leverage.</h2></div><p>These examples are not a limitation on who Nexus can help. The real question is whether a specific workflow occurs often enough, costs enough, and can be measured responsibly.</p></div><div class="grid">
<div class="card"><span class="tag">Construction & field service</span><h3>Contractors and project businesses</h3><p>Estimate follow-up, project reporting, document routing, meeting-to-action workflows, intake, and company knowledge.</p></div>
<div class="card"><span class="tag">Appointment businesses</span><h3>Beauty, wellness, fitness and local service</h3><p>Booking intake, confirmations, reminders, no-show reduction, rebooking, FAQs, schedule utilization, and owner reporting.</p></div>
<div class="card"><span class="tag">Professional services</span><h3>Agencies, consultants and B2B firms</h3><p>Client intake, proposals, recurring reporting, meeting actions, CRM updates, document workflows, and internal knowledge.</p></div>
<div class="card"><span class="tag">Home & property services</span><h3>HVAC, plumbing, electrical, cleaning and similar teams</h3><p>Lead response, estimate follow-up, scheduling, customer updates, review requests, dispatch information, and reporting.</p></div>
<div class="card"><span class="tag">Product & e-commerce</span><h3>Retail, specialty products and online brands</h3><p>Customer inquiry triage, order exceptions, wholesale follow-up, product knowledge, review analysis, and sales/inventory summaries.</p></div>
<div class="card"><span class="tag">Other qualified SMBs</span><h3>Your industry does not need to be listed.</h3><p>If the work is repetitive, measurable, digitally accessible, and owned by someone who can approve change, it can be evaluated.</p></div>
</div></div></section>
<section><div class="wrap"><div class="section-head"><div><div class="kicker">Concrete example</div><h2>What this can look like for an appointment-based beauty business.</h2></div><p>The business does not need a technical team. Nexus can start with the booking process, schedule history, customer communication, and the operating numbers the owner already has.</p></div><div class="example-box"><h3>Example: beauty, waxing, salon, spa, fitness, or other appointment-driven business</h3><div class="usecase-list">
<div class="usecase"><b>Booking intake</b><span>Understand how customers schedule, reschedule, cancel, and ask questions.</span></div>
<div class="usecase"><b>Confirmation & reminder workflow</b><span>Reduce manual follow-up while keeping the business in control of customer communication.</span></div>
<div class="usecase"><b>No-show and cancellation analysis</b><span>Measure where schedule capacity is being lost before recommending an intervention.</span></div>
<div class="usecase"><b>Rebooking & reactivation</b><span>Identify customers who may be appropriate for human-approved follow-up.</span></div>
<div class="usecase"><b>FAQ and service knowledge</b><span>Organize approved information so staff and customers get more consistent answers.</span></div>
<div class="usecase"><b>Schedule utilization</b><span>Use booking history to see high-demand periods, underused capacity, and recurring patterns.</span></div>
<div class="usecase"><b>Owner dashboard</b><span>Surface bookings, cancellations, demand, follow-up, and priorities without checking every system manually.</span></div>
</div></div></div></section>
<section><div class="wrap"><div class="section-head"><div><div class="kicker">Strong-fit signals</div><h2>Five questions matter more than your industry.</h2></div></div><div class="signal-grid"><div class="signal"><b>Does it repeat?</b><span>The same task, handoff, question, report, booking, or follow-up happens regularly.</span></div><div class="signal"><b>Does it create a cost?</b><span>It consumes labor, slows revenue, creates errors, frustrates customers, or limits capacity.</span></div><div class="signal"><b>Does useful information exist?</b><span>The evidence lives in email, spreadsheets, CRM, scheduling, accounting, documents, or other business systems.</span></div><div class="signal"><b>Can someone approve change?</b><span>An owner or manager can explain the workflow and make decisions.</span></div><div class="signal"><b>Can we measure it?</b><span>A baseline can be established so the business can see whether the change worked.</span></div></div><div class="actions centered-actions"><a class="btn primary" href="/quick-scan">Check My Business →</a></div></div></section>
</main>
<footer class="footer"><div class="wrap footer-grid"><div><div class="brand"><span class="mark">N</span><span>Nexus Intelligence</span></div><p class="small">Practical AI systems and measurable business improvement for small and mid-sized businesses.</p></div><div><b>Explore</b><a href="/services">Solutions</a><a href="/methodology">How It Works</a><a href="/case-studies">Results</a></div><div><b>Company</b><a href="/about">About</a><a href="/portal">Client Portal</a><a href="/security">Security</a></div><div><b>Legal</b><a class="privacy-link" href="/privacy">Privacy</a><a href="/terms">Terms</a></div></div></footer>
<div id="cookieBanner" class="cookie" role="dialog" aria-label="Analytics consent"><p>Optional analytics loads only if you accept. See <a href="/privacy">Privacy</a>.</p><div class="cookie-actions"><button id="declineCookies" class="btn secondary">Decline</button><button id="acceptCookies" class="btn primary">Accept</button></div></div><script src="/app.js"></script>
</body></html>'''
(ROOT/'industries.html').write_text(industries)

# Security page present-tense repair in source.
security = (ROOT/'security.html').read_text()
security = security.replace('The portal is being built as an authenticated business workspace, not a public document dropbox.', 'The Nexus Client Portal is an authenticated business workspace, not a public document dropbox.')
(ROOT/'security.html').write_text(security)

# ---------------- Public + portal QA assertions ----------------
qa = (ROOT/'.github/workflows/qa.yml').read_text()
needle = """          grep -q 'submit_nexus_opportunity_snapshot' functions/api/opportunity-snapshot.js\n"""
extra = """          grep -q 'submit_nexus_opportunity_snapshot' functions/api/opportunity-snapshot.js\n      - name: SMB customer journey v3 assertions\n        shell: bash\n        run: |\n          set -euo pipefail\n          grep -q \"href:'/book',label:'Request My Fit Call'\" app.js\n          grep -q 'Free AI Snapshot' app.js\n          grep -q 'injectSimpleCustomerJourney' app.js\n          grep -q 'simplifyQuickScanHandoff' app.js\n          grep -q 'simplifyFitCallExperience' app.js\n          grep -q 'CLIENT ACCOUNT · KEEP IT SIMPLE' portal-simplify.js\n          grep -q 'portalClientNavGroups' portal-simplify.js\n          grep -q 'How this work is done today' portal-simplify.js\n          grep -q '3–10 real examples' portal-simplify.js\n          grep -q 'appointment-based beauty business' industries.html\n          if grep -qi 'Moon Wax' industries.html; then\n            echo 'Client-adjacent Moon Wax reference must not appear on the public industries page.' >&2\n            exit 1\n          fi\n          grep -q 'The Nexus Client Portal is an authenticated business workspace' security.html\n"""
if needle not in qa:
    raise SystemExit('QA insertion point missing')
qa = qa.replace(needle, extra)
(ROOT/'.github/workflows/qa.yml').write_text(qa)

# CSS for the new public journey and fit-call guide.
p = ROOT / 'experience-round-two.css'
css = p.read_text()
css += r'''

/* SMB customer journey v3 */
.nx-customer-journey-section{padding-top:20px}.nx-journey-shell{padding:28px;border:1px solid rgba(101,216,255,.18);border-radius:22px;background:linear-gradient(145deg,rgba(101,216,255,.055),rgba(117,228,181,.025))}.nx-journey-head{max-width:840px}.nx-journey-head h2{font-size:clamp(31px,4vw,46px);margin:8px 0 10px}.nx-journey-head p{color:var(--muted);margin:0}.nx-journey-steps{display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr auto 1fr;gap:9px;align-items:stretch;margin-top:22px}.nx-journey-steps>div{padding:16px;border:1px solid var(--line);border-radius:14px;background:rgba(0,0,0,.08)}.nx-journey-steps span{display:block;color:var(--accent);font-size:10px;font-weight:900}.nx-journey-steps b{display:block;font-size:15px;margin:7px 0}.nx-journey-steps small{display:block;color:var(--muted);line-height:1.45}.nx-journey-steps i{align-self:center;color:var(--accent);font-style:normal}.nx-journey-shell .actions{margin-top:20px}
.nx-optional-diagnostic{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;margin-top:18px;padding:13px 15px;border:1px solid rgba(255,198,109,.2);border-radius:13px;background:rgba(255,198,109,.045);font-size:12px}.nx-optional-diagnostic b{color:#ffe0aa}.nx-optional-diagnostic span{color:var(--muted)}.nx-optional-diagnostic .btn{margin:0}
.nx-fit-call-guide{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:20px}.nx-fit-call-guide>div{padding:14px 15px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.025)}.nx-fit-call-guide span{display:grid;place-items:center;width:27px;height:27px;border-radius:50%;border:1px solid rgba(101,216,255,.25);color:var(--accent);font-size:10px;font-weight:900}.nx-fit-call-guide b{display:block;margin:9px 0 4px;font-size:14px}.nx-fit-call-guide small{display:block;color:var(--muted);line-height:1.45}
@media(max-width:930px){.nx-journey-steps{grid-template-columns:1fr}.nx-journey-steps i{transform:rotate(90deg);justify-self:center}.nx-fit-call-guide{grid-template-columns:1fr}.nx-optional-diagnostic{grid-template-columns:1fr}.nx-optional-diagnostic .btn{width:100%}}
'''
p.write_text(css)

print('journey_v3_patch complete')
