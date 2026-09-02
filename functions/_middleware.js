const SITE_ORIGIN='https://nexusintelligence.live';
const PRIVATE_PREFIXES=['/portal','/operations','/prospect-workspace','/booking-manage','/api/'];
const SERVICE_SLUGS=new Set(['ai-enablement-training','ai-opportunity-assessment','business-transformation','fractional-ai-director','implementation-sprint','managed-ai-operations']);

const organizationSchema={
  '@context':'https://schema.org',
  '@type':'Organization',
  '@id':`${SITE_ORIGIN}/#organization`,
  name:'Nexus Intelligence',
  url:`${SITE_ORIGIN}/`,
  logo:`${SITE_ORIGIN}/logo.svg`,
  description:'Nexus Intelligence finds where AI can improve your business, builds the right systems, and measures whether they actually work.',
  areaServed:{'@type':'Country',name:'United States'}
};

const servicesSchema={
  '@context':'https://schema.org',
  '@type':'Service',
  '@id':`${SITE_ORIGIN}/services#service`,
  name:'Nexus Intelligence AI & Automation Services',
  serviceType:'AI and automation implementation consulting',
  provider:{'@type':'Organization','@id':`${SITE_ORIGIN}/#organization`,name:'Nexus Intelligence',url:`${SITE_ORIGIN}/`},
  areaServed:{'@type':'Country',name:'United States'},
  description:'Nexus Intelligence provides AI opportunity assessment, implementation, enablement, managed AI operations, business transformation, and fractional AI leadership services for small and mid-sized businesses.',
  hasOfferCatalog:{
    '@type':'OfferCatalog',
    name:'Nexus Intelligence Services',
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
      itemOffered:{'@type':'Service',name,provider:{'@type':'Organization','@id':`${SITE_ORIGIN}/#organization`,name:'Nexus Intelligence',url:`${SITE_ORIGIN}/`}}
    }))
  }
};

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
  const response=await context.next();
  const url=new URL(context.request.url);
  const path=canonicalPath(url.pathname);
  const isPrivate=PRIVATE_PREFIXES.some(prefix=>path===prefix||path.startsWith(prefix));
  const isPreview=url.hostname.endsWith('.pages.dev');
  const headers=new Headers(response.headers);

  if(isPrivate)headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
  else if(isPreview)headers.set('X-Robots-Tag','noindex');

  if(!String(headers.get('content-type')||'').includes('text/html')){
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }

  if(response.status>=400&&!headers.has('X-Robots-Tag'))headers.set('X-Robots-Tag','noindex');

  const canonical=`${SITE_ORIGIN}${path}`;
  const headHtml=isPrivate
    ? '<meta name="robots" content="noindex,nofollow,noarchive">'
    : `<link rel="canonical" href="${canonical}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">${path==='/'?jsonLd(organizationSchema):''}${path==='/services'?jsonLd(servicesSchema):''}`;

  const transformed=new HTMLRewriter()
    .on('link[rel="canonical"]',{element(el){el.remove();}})
    .on('meta[property="og:url"]',{element(el){el.remove();}})
    .on('script[data-nexus-schema="indexability"]',{element(el){el.remove();}})
    .on('head',{element(el){el.append(headHtml,{html:true});}})
    .on('body',{element(el){el.append('<script src="/launch-readiness.js?v=20260830-2"></script><script src="/snapshot-lifecycle-patch.js?v=20260830-1"></script>',{html:true});}})
    .transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));
  return transformed;
}
