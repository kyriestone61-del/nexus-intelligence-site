export async function onRequest(context) {
  const response = await context.env.ASSETS.fetch(context.request);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const origin = new URL(context.request.url).origin;
  const html = await response.text();
  let patched = html.replace(
    "LIVE='https://nexus-intelligence-v3-preview.vercel.app/portal'",
    `LIVE='${origin}/portal'`
  );

  // The portal must run the exact code packaged in this Cloudflare deployment.
  // Never load mutable @main GitHub/jsDelivr assets from an older or newer build.
  patched = patched.replace(
    /https:\/\/cdn\.jsdelivr\.net\/gh\/kyriestone61-del\/nexus-intelligence-site@main\/([^"'\s?]+)(\?[^"'\s]*)?/g,
    (_match,path,query='') => `/${path}${query}`
  );

  if (!patched.includes('id="mainWebsiteBtn"')) {
    patched = patched.replace(
      '<select id="companySelect"',
      '<a id="mainWebsiteBtn" class="btn secondary" href="/" title="Return to the Nexus Intelligence website">← Main Website</a><select id="companySelect"'
    );
  }

  if (!patched.includes('/secure-documents.css')) patched = patched.replace('</head>', '<link rel="stylesheet" href="/secure-documents.css"></head>');
  if (!patched.includes('/portal-auth.css')) patched = patched.replace('</head>', '<link rel="stylesheet" href="/portal-auth.css"></head>');
  if (!patched.includes('/portal-ops.css')) patched = patched.replace('</head>', '<link rel="stylesheet" href="/portal-ops.css"></head>');

  // Shared site code is portal-aware and only enables portal-safe behavior here.
  if (!patched.includes('src="/app.js"')) patched = patched.replace('</body>', '<script src="/app.js"></script></body>');

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(patched, {status: response.status,statusText: response.statusText,headers});
}
