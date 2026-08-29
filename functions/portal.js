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

  if (!patched.includes('/secure-documents.css')) {
    patched = patched.replace('</head>', '<link rel="stylesheet" href="/secure-documents.css"></head>');
  }

  const enhancement = `\nimport('/secure-documents.js').then(({init})=>init({sb,state,$,toast,download,log,workspace})).catch(err=>console.error('Secure documents enhancement failed',err));\n`;
  const scriptClose = patched.lastIndexOf('</script>');
  if (scriptClose !== -1 && !patched.includes('secure-documents.js')) {
    patched = patched.slice(0, scriptClose) + enhancement + patched.slice(scriptClose);
  }

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(patched, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
