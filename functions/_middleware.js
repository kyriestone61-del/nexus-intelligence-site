const PRIVATE_PREFIXES=['/portal','/operations','/prospect-workspace','/booking-manage','/api/'];
export async function onRequest(context){
  const response=await context.next();
  const url=new URL(context.request.url),isPrivate=PRIVATE_PREFIXES.some(x=>url.pathname===x||url.pathname.startsWith(x));
  const headers=new Headers(response.headers);
  if(isPrivate)headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
  if(!String(headers.get('content-type')||'').includes('text/html'))return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  const canonical=`${url.origin}${url.pathname.replace(/\/$/,'')||'/'}`;
  const transformed=new HTMLRewriter()
    .on('head',{element(el){
      if(isPrivate)el.append('<meta name="robots" content="noindex,nofollow,noarchive">',{html:true});
      else el.append(`<link rel="canonical" href="${canonical}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">`,{html:true});
    }})
    .on('body',{element(el){el.append('<script src="/launch-readiness.js?v=20260830-2"></script><script src="/snapshot-lifecycle-patch.js?v=20260830-1"></script>',{html:true})}})
    .transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));
  return transformed;
}
