const SITE_ORIGIN='https://nexusintelligence.live';
const PRIVATE_PREFIXES=['/portal','/operations','/prospect-workspace','/booking-manage','/api/'];
const PROTECTED_MARKETING_PATHS=new Set(['/privacy','/terms','/accessibility','/security']);
const SERVICE_SLUGS=new Set(['ai-enablement-training','ai-opportunity-assessment','business-transformation','fractional-ai-director','implementation-sprint','managed-ai-operations']);

const founderSchema={
  '@context':'https://schema.org',
  '@type':'Person',
  '@id':`${SITE_ORIGIN}/about#founder`,
  name:'Kyrie Stone',
  jobTitle:'Founder',
  url:`${SITE_ORIGIN}/about`,
  image:`${SITE_ORIGIN}/assets/kyrie-stone-founder-primary.webp`,
  worksFor:{'@type':'Organization','@id':`${SITE_ORIGIN}/#organization`,name:'Relystra',url:`${SITE_ORIGIN}/`},
  description:'Delaware-based founder of Relystra with 4+ years of commercial construction project-engineering and operations experience.'
};

const organizationSchema={
  '@context':'https://schema.org',
  '@type':'Organization',
  '@id':`${SITE_ORIGIN}/#organization`,
  name:'Relystra',
  url:`${SITE_ORIGIN}/`,
  logo:`${SITE_ORIGIN}/logo.svg`,
  image:`${SITE_ORIGIN}/assets/kyrie-stone-founder-primary.webp`,
  description:'Relystra identifies where AI and automation are justified, designs and implements controlled systems, and measures what changed.',
  areaServed:{'@type':'Country',name:'United States'},
  founder:{'@type':'Person','@id':`${SITE_ORIGIN}/about#founder`,name:'Kyrie Stone',url:`${SITE_ORIGIN}/about`,image:`${SITE_ORIGIN}/assets/kyrie-stone-founder-primary.webp`}
};

const servicesSchema={
  '@context':'https://schema.org',
  '@type':'Service',
  '@id':`${SITE_ORIGIN}/services#service`,
  name:'Relystra AI & Automation Services',
  serviceType:'AI and automation implementation consulting',
  provider:{'@type':'Organization','@id':`${SITE_ORIGIN}/#organization`,name:'Relystra',url:`${SITE_ORIGIN}/`},
  areaServed:{'@type':'Country',name:'United States'},
  description:'Relystra provides AI opportunity assessment, implementation, enablement, managed AI operations, business transformation, and fractional AI leadership services for small and mid-sized businesses.',
  hasOfferCatalog:{
    '@type':'OfferCatalog',
    name:'Relystra Services',
    itemListElement:[
      ['AI Opportunity Assessment','ai-opportunity-assessment'],
      ['Implementation Sprint','implementation-sprint'],
      ['AI Enablement & Training','ai-enablement-training'],
      ['Managed AI Operations','managed-ai-operations'],
      ['Business Transformation','business-transformation'],
      ['Fractional AI Director','fractional-ai-director']
    ].map(([name,slug])=>({
      '@type':'Offer',
      url:`${SITE_ORIGIN}/services/${slug}`,
      itemOffered:{'@type':'Service',name,provider:{'@type':'Organization','@id':`${SITE_ORIGIN}/#organization`,name:'Relystra',url:`${SITE_ORIGIN}/`}}
    }))
  }
};

const founderHomepageSection=`<section id="founderSnapshot"><div class="wrap"><div class="split" style="align-items:center"><div><img src="/assets/kyrie-stone-founder-primary.webp" width="360" height="450" loading="lazy" alt="Kyrie Stone, founder of Relystra" style="width:100%;max-width:360px;aspect-ratio:4/5;object-fit:cover;border-radius:22px;border:1px solid var(--line);display:block"></div><div><div class="kicker">Founder</div><h2 style="font-size:40px">Built by someone who has worked inside the workflows.</h2><p>Kyrie Stone is the Delaware-based founder of Relystra and a project engineer with 4+ years of commercial construction operations experience across submittals, RFIs, document control, subcontractor coordination, and site-safety responsibilities.</p><p style="color:var(--muted)">That background informs a practical approach to AI: understand the work, establish the baseline, identify the friction, preserve human ownership, and automate only what is justified.</p><div class="actions"><a class="btn secondary" href="/about">Meet Kyrie Stone</a></div></div></div></div></section>`;

const pricingSignal=`<p class="note" data-phase-five-pricing style="margin-top:18px"><b>Investment guidance is published below.</b> Each service shows a current starting point and typical planning window so you can assess fit before a call. Final fees and scope are defined in writing based on the actual engagement.</p>`;

const productionRobots=`User-agent: *\nAllow: /\nDisallow: /portal\nDisallow: /operations\nDisallow: /prospect-workspace\nDisallow: /booking-manage\nDisallow: /api/\n`;
const privacyTransition='Brand transition notice: Relystra is the current public-facing brand, formerly presented as Nexus Intelligence. Existing signed agreements remain governed by their written terms.';
const termsTransition='Brand transition notice: Relystra is the current public-facing brand, formerly presented as Nexus Intelligence. These website terms do not rename, replace, or amend any existing signed agreement.';
const accessibilityContact='A monitored accessibility contact method will be published when available. Relystra does not invent a contact address that is not actively monitored.';

function canonicalPath(pathname){
  let path=pathname||'/';
  if(path.length>1&&path.endsWith('/'))path=path.slice(0,-1);
  if(path.endsWith('.html'))path=path.slice(0,-5)||'/';
  if(path==='/index')return '/';
  if(path==='/service-detail')return '/services';
  if(path.startsWith('/industries/'))return '/industries';
  if(path.startsWith('/services/')){
    const slug=path.slice('/services/'.length).split('/')[0];
    if(SERVICE_SLUGS.has(slug))return `/services/${slug}`;
  }
  return path||'/';
}

function jsonLd(schema){
  return `<script type="application/ld+json" data-nexus-schema="indexability">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script>`;
}

export async function onRequest(context){
  const url=new URL(context.request.url);
  const path=canonicalPath(url.pathname);
  const isPreview=url.hostname.endsWith('.pages.dev');
  const isProductionOrigin=url.hostname==='nexusintelligence.live'||url.hostname==='www.nexusintelligence.live';

  if(url.pathname==='/robots.txt'&&isProductionOrigin){
    return new Response(productionRobots,{status:200,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'public, max-age=300'}});
  }

  if(path==='/case-studies'){
    const target=new URL('/methodology',url.origin);
    target.search=url.search;
    return Response.redirect(target.toString(),301);
  }

  const response=await context.next();
  const isPrivate=PRIVATE_PREFIXES.some(prefix=>path===prefix||path.startsWith(prefix));
  const isProtectedMarketing=PROTECTED_MARKETING_PATHS.has(path);
  const headers=new Headers(response.headers);

  if(isPrivate)headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
  else if(isPreview)headers.set('X-Robots-Tag','noindex');
  else if(isProductionOrigin)headers.delete('X-Robots-Tag');

  if(!String(headers.get('content-type')||'').includes('text/html')){
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }

  if(response.status>=400&&!headers.has('X-Robots-Tag'))headers.set('X-Robots-Tag','noindex');

  const canonical=`${SITE_ORIGIN}${path}`;
  const structuredData=`${path==='/'?jsonLd(organizationSchema):''}${path==='/services'?jsonLd(servicesSchema):''}${path==='/about'?jsonLd(founderSchema):''}`;
  const headHtml=isPrivate
    ? '<meta name="robots" content="noindex,nofollow,noarchive">'
    : `<link rel="canonical" href="${canonical}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">${structuredData}`;

  const transformed=new HTMLRewriter()
    .on('link[rel="canonical"]',{element(el){el.remove();}})
    .on('meta[property="og:url"]',{element(el){el.remove();}})
    .on('script[data-nexus-schema="indexability"]',{element(el){el.remove();}})
    .on('meta[name="robots"]',{element(el){if(isProductionOrigin&&!isPrivate)el.remove();}})
    .on('meta[name="relystra-stage"]',{element(el){if(isProductionOrigin)el.remove();}})
    .on('meta[name="description"]',{element(el){if(path==='/')el.setAttribute('content','Relystra identifies where AI and automation are justified, designs and implements controlled systems, and measures what changed.');}})
    .on('head',{element(el){el.append(headHtml,{html:true});}})
    .on('.legal .note',{element(el){if(!isProductionOrigin)return;if(path==='/privacy')el.setInnerContent(privacyTransition);if(path==='/terms')el.setInnerContent(termsTransition);}})
    .on('.legal h2:last-of-type + p',{element(el){if(isProductionOrigin&&path==='/accessibility')el.setInnerContent(accessibilityContact);}})
    .on('.navlinks a[href="/case-studies"]',{element(el){if(!isProtectedMarketing&&!isPrivate)el.remove();}})
    .on('#serviceRoot .hero',{element(el){if(path==='/services')el.append(pricingSignal,{html:true});}})
    .on('.hero-home .hero-copy > p',{element(el){if(path==='/')el.setInnerContent('Relystra identifies where AI and automation are justified, designs and implements controlled systems, and measures what changed.');}})
    .on('.preview-metric small',{element(el){if(path==='/')el.remove();}})
    .on('.problem-btn[data-problem="revenue"]',{element(el){if(path==='/')el.remove();}})
    .on('.problem-btn[data-problem="data"]',{element(el){if(path==='/')el.remove();}})
    .on('.problem-btn[data-problem="manual"] span',{element(el){if(path==='/')el.setInnerContent('01');}})
    .on('.problem-btn[data-problem="service"] span',{element(el){if(path==='/')el.setInnerContent('02');}})
    .on('.problem-btn[data-problem="knowledge"] span',{element(el){if(path==='/')el.setInnerContent('03');}})
    .on('.problem-btn[data-problem="systems"] span',{element(el){if(path==='/')el.setInnerContent('04');}})
    .on('#problemDetail .kicker',{element(el){if(path==='/')el.setInnerContent('Relystra evaluation');}})
    .on('#problemText',{element(el){if(path==='/')el.setInnerContent('Relystra maps repetitive handoffs, copying, routing, document preparation, and status-update work, then evaluates which steps are appropriate for automation.');}})
    .on('.flow-card.after .flow-head .tag',{element(el){if(path==='/')el.setInnerContent('Illustrative target state');}})
    .on('.flow-card.after .flow-foot',{element(el){if(path==='/')el.setInnerContent('Target state: fewer manual handoffs • explicit controls • measurable process');}})
    .on('main',{element(el){if(path==='/')el.append(founderHomepageSection,{html:true});}})
    .on('body',{element(el){el.append('<script src="/launch-readiness.js?v=20260830-2"></script><script src="/snapshot-lifecycle-patch.js?v=20260830-1"></script><script src="/phase-two.js?v=20260902-1"></script><script src="/phase-three.js?v=20260902-1"></script><script src="/phase-five.js?v=20260902-1"></script>',{html:true});}})
    .transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));
  return transformed;
}
