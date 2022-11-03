/*
 * Copyright (c) 2022 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export const jsonHeader = { "content-type": "application/json;charset=UTF-8" };
export const response500 = new Response(null, { status: 500 });
export const response502 = new Response(null, { status: 502 });
export const response503 = new Response(null, { status: 503 });

export function mkJsonResponse(j) {
  const rj = JSON.stringify(j, /*replacer*/ null, /*space*/ 2);
  return new Response(rj, { headers: jsonHeader });
}

export function asStream(b, typ) {
  if (typ === "stream-gz") {
    return b.pipeThrough(new CompressionStream("gzip"));
  }
  return b;
}

export function asAttachment(h, n) {
  if (!h) return;
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
  // r.origin  => protocol//<subdomain>.<rootdomain>.<tld> => https://download.bravedns.com
  // which is not what we want. We instead need just the rootdomain: https://bravedns.com
  // but that's complicated: https://stackoverflow.com/questions/8498592/ and so, hard-code
  // our way out of this quagmire, since we know all our domains are ".com" TLDs.
  // see also: https://stackoverflow.com/questions/14003332/
  // corsheader = r.origin
  h.set("Access-Control-Allow-Origin", "*");
  h.append("Vary", "Origin");
}
