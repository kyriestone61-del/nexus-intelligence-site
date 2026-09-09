export function onRequest(context) { return Response.redirect(new URL('/book', context.request.url).toString(),301); }
