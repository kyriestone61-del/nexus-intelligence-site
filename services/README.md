# Service detail routing

Each public service has a real static route at `/services/<slug>/index.html`.

Do not reintroduce a Cloudflare Pages wildcard rewrite from `/services/*` to a single `.html` file. Pages pretty-URL canonicalization can redirect the rewritten asset to its extensionless filename and discard the original service slug.

The six route shells share `/service-route.js`, which loads the canonical service template from `/services.html` using the route's `data-service-slug` value.
