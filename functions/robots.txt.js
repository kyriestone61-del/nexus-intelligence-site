const SITEMAP='https://nexusintelligence.live/sitemap.xml';

export async function onRequestGet(){
  const body=`User-agent: *\nAllow: /\n\nSitemap: ${SITEMAP}\n`;
  return new Response(body,{headers:{
    'content-type':'text/plain; charset=utf-8',
    'cache-control':'public,max-age=3600'
  }});
}
