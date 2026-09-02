const SITE_ORIGIN='https://nexusintelligence.live';
const PUBLIC_PATHS=[
  '/',
  '/about',
  '/accessibility',
  '/assessment',
  '/capabilities',
  '/delivery-standard',
  '/faq',
  '/industries',
  '/methodology',
  '/privacy',
  '/problems',
  '/quick-scan',
  '/roi-calculator',
  '/security',
  '/services',
  '/services/ai-enablement-training',
  '/services/ai-opportunity-assessment',
  '/services/business-transformation',
  '/services/fractional-ai-director',
  '/services/implementation-sprint',
  '/services/managed-ai-operations',
  '/terms'
];

function escapeXml(value){
  return String(value).replace(/[<>&'\"]/g,char=>({
    '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','\"':'&quot;'
  }[char]));
}

export async function onRequestGet(){
  const urls=PUBLIC_PATHS.map(path=>`<url><loc>${escapeXml(`${SITE_ORIGIN}${path}`)}</loc></url>`).join('');
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
  return new Response(xml,{headers:{
    'content-type':'application/xml; charset=utf-8',
    'cache-control':'public,max-age=3600'
  }});
}
