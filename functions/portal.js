export async function onRequest(context) {
  const response = await context.env.ASSETS.fetch(context.request);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const origin = new URL(context.request.url).origin;
  const html = await response.text();
  const patched = html.replace(
    "LIVE='https://nexus-intelligence-v3-preview.vercel.app/portal'",
    `LIVE='${origin}/portal'`
  );

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(patched, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
