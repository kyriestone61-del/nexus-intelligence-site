export async function onRequest(context) {
  const response = await context.env.ASSETS.fetch(context.request);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();
  if (!html.includes('/diagnostic-ui.css')) {
    html = html.replace('</head>', '<link rel="stylesheet" href="/diagnostic-ui.css"></head>');
  }

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
