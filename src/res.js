/*
 * Copyright (c) 2022 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export const jsonHeaders = { "content-type": "application/json;charset=UTF-8" };
export const txtHeaders = { "content-type": "text/plain;charset=UTF-8" };
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};
export const methodHeaders = {
  Allow: "GET,HEAD,POST,OPTIONS",
};
// 400: bad request
export const response400 = new Response(null, { status: 400 });
// 405: method not allowed
export const response405 = new Response(null, { status: 405 });
// 500: internal error
export const response500 = new Response(null, { status: 500 });
// 502: bad gateway / server did not respond
export const response502 = new Response(null, { status: 502 });
// 503: service unavailable / server not ready
export const response503 = new Response(null, { status: 503 });

export function mkJsonResponse(j) {
  const rj = JSON.stringify(j, /* replacer*/ null, /* space*/ 2);
  return new Response(rj, { headers: jsonHeaders });
}

export function mkTxtResponse(txt) {
  return new Response(txt, { headers: txtHeaders });
}

/**
 * @param {Response} res
 * @param {string} typ
 * @returns {ReadableStream}
 */
export function asStream(res, typ) {
  const b = res.body;

  if (!b) return null;

  if (typ === "stream-gz") {
    return b.pipeThrough(new CompressionionStream("gzip"));
  } else if (typ === "stream-nogz") {
    return b.pipeThrough(new DecompressionStream("gzip"));
  }
  return b;
}

export function asAttachment(h, n) {
  if (!h) return;
  // eslint-disable-next-line quotes
  h.set("content-disposition", 'attachment; filename="' + n + '"');
}

export function withContentType(h, typ) {
  if (!h || !typ) return;
  if (typ === "blob") {
    h.set("content-type", "application/octet-stream");
  } else if (typ === "compressable-blob") {
    // cf does not compress octet-streams: archive.is/CDnBh
    // but compresses application/wasm: archive.is/rT2pZ
    h.set("content-type", "application/wasm");
  } else if (typ === "json") {
    h.set("content-type", "application/json;charset=UTF-8");
  }
}

export function allowCors(h) {
  if (!h) return;
  // developers.cloudflare.com/workers/examples/cors-header-proxy
  // r.origin
  //   => protocol//<subdomain>.<rootdomain>.<tld>
  //   => https://download.bravedns.com
  // which is not what we want.
  // We instead need just the rootdomain: https://bravedns.com
  //
  // but that's complicated: stackoverflow.com/questions/8498592
  // and so, hard-code our way out of this quagmire, since we
  // know all our domains are ".com" TLDs.
  // also: stackoverflow.com/questions/14003332/
  //
  // corsheader = r.origin
  h.set("Access-Control-Allow-Origin", "*");
  h.append("Vary", "Origin");
}

function pprintres(res) {
  if (!res) return console.warn("res empty");
  const u = res.url;
  const s = res.status;
  const t = res.statusText;
  let h = "";
  for (const [k, v] of res.headers) h += k + ":" + v + ",";
  console.debug("res:", s, t, "url", u, "headers", h);
}

export function pprintreq(req) {
  const m = req.method;
  const u = req.url;
  let h = "";
  for (const [k, v] of req.headers) h += k + ":" + v + ",";
  console.debug("req:", m, "url", u, "headers", h);
}

export function responseOkay(r) {
  if (!r) return false; // no res
  if (r.ok) return true; // 2xx
  if (r.status >= 300 && r.status < 399) return true;
  pprintres(r);
  return false;
}
