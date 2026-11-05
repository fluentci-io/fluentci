export const welcome = String.raw`
   __ _                  _       _
  / _| |                | |     (_)
 | |_| |_   _  ___ _ __ | |_ ___ _
 |  _| | | | |/ _ \ '_ \| __/ __| |
 | | | | |_| |  __/ | | | || (__| |
 |_| |_|\__,_|\___|_| |_|\__\___|_|

FluentCI API

Website: https://fluentci.io
Documentation: https://docs.fluentci.io

API endpoints are under /xrpc
Health: /xrpc/_health
`;

export function index(request, response) {
  if (request.accepts(['text/plain', 'text/html']) === 'text/html') {
    const art = welcome.slice(0, welcome.indexOf('FluentCI API')).trimEnd();
    return response.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FluentCI API</title>
<style>:root{color-scheme:dark}body{max-width:48rem;margin:12vh auto;padding:0 1.5rem;background:#09090d;color:#efeff5;font:15px/1.8 monospace}pre{overflow-x:auto;color:#c3a6ff;font-size:clamp(9px,2.5vw,16px)}a{color:#73d9ea}code{color:#c3a6ff}nav{display:flex;gap:1.5rem;flex-wrap:wrap}</style></head>
<body><pre aria-hidden="true">${art}</pre><h1>FluentCI API</h1><p>API endpoints are under <code>/xrpc</code>.</p>
<nav><a href="https://fluentci.io">Website</a><a href="https://docs.fluentci.io">Documentation</a><a href="/xrpc/_health">Health</a></nav></body></html>`);
  }
  return response.type('text/plain').send(welcome);
}
