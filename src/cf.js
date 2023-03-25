/*
 * Copyright (c) 2023 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// from: github.com/celzero/otp/blob/cddaaa03f1/src/base/req.js#L1

const xfwfor = "X-Forwarded-For";
const cfcip = "CF-Connecting-IP";
const noip = "0";

class Assoc {
  constructor(obj) {
    this.isp = obj.isp;
    this.ips = obj.ips;
    this.addr = obj.addr;
    this.proto = obj.proto;
    this.dc = obj.dc;
  }
}

const cfdefault = {
  asOrganization: "",
  asn: 0,
  colo: "",
  country: "",
  httpProtocol: "",
};

// developers.cloudflare.com/workers/runtime-apis/request
function info(req) {
  const cf = getcf(req);
  const ips = getips(req);
  return assoc(
    cf.asOrganization,
    cf.city,
    cf.country,
    cf.colo,
    cf.httpProtocol,
    ips
  );
}

export function infoStrWithDate(req) {
  return infoStr(req) + "; " + nowstr();
}

function infoStr(req) {
  const f = info(req);
  return f.ips + " (" + f.addr + ")";
}

// proto:host.tld/path?query=param#hash -> proto:host.tld
export function originStr(url) {
  if (!url || !url.origin) return "";
  return url.origin;
}

function nowstr() {
  const d = new Date();
  return (
    "on " +
    d.getUTCFullYear() +
    "/" +
    d.getUTCMonth() +
    "/" +
    d.getUTCDate() +
    " at " +
    d.getUTCHours() +
    ":" +
    d.getUTCMinutes() +
    " (GMT)"
  );
}

function assoc(isp, city, nation, colo, proto, ips) {
  return new Assoc({
    isp: isp,
    ips: ips,
    addr: city + ", " + nation,
    proto: proto,
    dc: colo,
  });
}

// developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties
function getcf(r) {
  if (r == null || r.cf == null) {
    return cfdefault;
  }
  return r.cf;
}

// developers.cloudflare.com/fundamentals/get-started/reference/http-request-headers
function getips(r) {
  if (r == null || r.headers == null) {
    return noip;
  }
  const h = r.headers;
  if (h.has(xfwfor)) {
    // csv: "ip1,ip2,ip3" where ip1 is the client, ip2/ip3 are the proxies
    return h.get(xfwfor);
  }
  if (h.has(cfcip)) {
    return h.get(cfcip);
  }
  return noip;
}
