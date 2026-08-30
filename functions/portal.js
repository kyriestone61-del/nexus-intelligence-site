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

  if (!patched.includes('id="mainWebsiteBtn"')) {
    patched = patched.replace(
      '<select id="companySelect"',
      '<a id="mainWebsiteBtn" class="btn secondary" href="/" title="Return to the Nexus Intelligence website">← Main Website</a><select id="companySelect"'
    );
  }

  if (!patched.includes('/secure-documents.css')) patched = patched.replace('</head>', '<link rel="stylesheet" href="/secure-documents.css"></head>');
  if (!patched.includes('/portal-auth.css')) patched = patched.replace('</head>', '<link rel="stylesheet" href="/portal-auth.css"></head>');
  if (!patched.includes('/portal-ops.css')) patched = patched.replace('</head>', '<link rel="stylesheet" href="/portal-ops.css"></head>');

  // Load the shared Nexus journey/UX layer inside the authenticated portal too.
  // app.js detects /portal and only enables portal-safe behaviors there.
  if (!patched.includes('src="/app.js"')) {
    patched = patched.replace('</body>', '<script src="/app.js"></script></body>');
  }

  const enhancements = `\nimport('/portal-auth.js').then(({initAuthUX})=>initAuthUX({sb,$,pane,show})).catch(err=>console.error('Portal auth UX enhancement failed',err));\nPromise.all([import('/secure-documents.js'),import('/portal-ops.js')]).then(([docs,ops])=>{const moduleWait=setInterval(()=>{const app=document.getElementById('portalApp'),projectBox=document.getElementById('projectBox');const readyNoClients=state.admin&&Array.isArray(state.companies)&&state.companies.length===0;const readyWorkspace=state.companyId&&projectBox&&projectBox.innerHTML.trim();if(state.user&&app&&app.style.display==='block'&&(readyNoClients||readyWorkspace)){clearInterval(moduleWait);docs.init({sb,state,$,toast,download,log,workspace});ops.initOps({sb,state,$,toast,workspace,log});}},180);setTimeout(()=>clearInterval(moduleWait),20000)}).catch(err=>console.error('Portal enhancement load failed',err));\n`;
  const scriptClose = patched.lastIndexOf('</script>');
  if (scriptClose !== -1 && !patched.includes('portal-ops.js')) patched = patched.slice(0, scriptClose) + enhancements + patched.slice(scriptClose);

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(patched, {status: response.status,statusText: response.statusText,headers});
}
