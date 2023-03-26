/*
 * Copyright (c) 2023 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as modres from "./res.js";
import * as modcf from "./cf.js";

// from: github.com/maple3142/cf-warp/blob/a9ca3094/cli.js#L1

export function handleWarpRequest(env, request) {
  const r = new URL(request.url);

  const path = r.pathname;
  const params = r.searchParams;

  if (path === "/warp/works") {
    const r = { works: env.WARP_ACTIVE };
    return modres.mkJsonResponse(r);
  } else if (path === "/warp/new") {
    return make(params, modcf.infoStrWithDate(request));
  } else if (path === "/warp/renew") {
    // todo: implement
  } else if (path === "/warp/quota") {
    return quota(params);
  }

  return modres.response400;
}

/**
 * @param {URLSearchParams} params
 * @param {String} client
 * @returns {Response}
 */
async function make(params, client) {
  console.log("creating warp credentials for " + client);

  const uid = mkuser(params);
  const cfdata = await register(uid);
  const cfdata2 = await info(cfdata.id, cfdata.token);
  const all = Object.assign({}, cfdata, cfdata2);
  all.uid = uid.json();
  all.wgconf = conf(all);
  console.log(all);
  return modres.mkJsonResponse(all);
}

function decode(uricomponent) {
  if (uricomponent) {
    return decodeURIComponent(uricomponent);
  } else {
    return "";
  }
}

function mkuser(params) {
  const pubkey = decode(params.get("pubkey"));
  const referrer = decode(params.get("referrer"));
  const device = decode(params.get("device"));
  const locale = decode(params.get("locale"));
  if (pubkey) {
    return new UserId(pubkey, referrer, device, locale);
  } else {
    throw new Error("cannot register, public key missing");
    /*
    const b = crypto.getRandomValues(new Uint8Array(32)));
    b[0] &= 248;
    b[31] = (b[31] & 127) | 64;
    // x25519 is not supported by webcrypto
    // wicg.github.io/webcrypto-secure-curves
    const k = Buffer.from(b).toString("base64");
    return {privateKey: k};
    */
  }
}

function genString(length) {
  let i = 0;
  let s = "";
  while (i < length) {
    const g = Math.random().toString(36).substring(2);
    s += g;
    i += g.length;
  }
  return s.substring(0, length);
}

/**
 * @param {UserId} uid
 */
async function register(uid) {
  const res = await fetch("https://api.cloudflareclient.com/v0a977/reg", {
    headers: {
      "User-Agent": "okhttp/3.12.1",
      "Content-Type": "application/json; charset=UTF-8",
    },
    method: "POST",
    cache: "no-cache",
    body: JSON.stringify(uid.json()),
  });

  /**
{
  id: '2ae0dbd9-30b0-4542-a5fa-4cbea46d2f7e',
  type: 'a',
  model: 'Xiaomi POCO X2',
  name: '',
  key: '0Vr/JZDAve8q+kmNVmiw4KdKiXc//M0EGOY6K9C11nw=',
  account: {
    id: '033d94a3-b301-44c8-a184-c374f0444fc2',
    account_type: 'free',
    created: '2023-03-23T21:45:59.470290884Z',
    updated: '2023-03-23T21:45:59.470290884Z',
    premium_data: 0,
    quota: 0,
    usage: 0,
    warp_plus: true,
    referral_count: 0,
    referral_renewal_countdown: 0,
    role: 'child',
    license: 'dB0Z9S52-2d7rK60b-Y39JT8w6'
  },
  config: {
    client_id: 'GH58',
    peers: [ [Object] ],
    interface: { addresses: [Object] },
    services: { http_proxy: '172.16.0.1:2480' }
  },
  token: '291d3fd8-ed35-41c4-bc71-ea045718d4e4',
  warp_enabled: true,
  waitlist_enabled: false,
  created: '2023-03-23T21:45:58.993726274Z',
  updated: '2023-03-23T21:45:58.993726274Z',
  tos: '2023-03-23T21:45:58.692+08:00',
  place: 0,
  locale: 'en-US',
  enabled: true,
  install_id: '0ulb6zzst99',
  fcm_token: '0ulb6zzst99:APA91bjkjrid9a0rc3l19z8s9wgip3h5kam6oy1ew1ppld1arpv0xysk0wqtavcpr9gwtaj90yc873om8kwa0359gnphhr5349y9ggasp6e6sj56mjyxtfxa4ygf0vfydhj445x2g54z'
}

OR

{
  result: null,
  success: false,
  errors: [ { code: 1001, message: 'Invalid public key' } ],
  messages: []
}
   */
  const ans = await res.json();

  if (ans.id) {
    return ans;
  } else {
    console.error(ans, uid.json());
    throw new Error("registration failed: " + ans.errors[0].message);
  }
}

async function info(id, token) {
  const res = await fetch(`https://api.cloudflareclient.com/v0a977/reg/${id}`, {
    headers: {
      "User-Agent": "okhttp/3.12.1",
      "Authorization": `Bearer ${token}`,
    },
    method: "GET",
    cache: "no-cache",
  });
  /*
{
  "id": "d37e1ad1-5685-4137-b9b8-325de4ad267f",
  "type": "a",
  "model": "Xiaomi POCO X2",
  "name": "",
  "key": "DAVemWOQZBonokPo7H1jiM61STpRUNYv0N0q27Uztgg=",
  "account": {
    "id": "4bc1f657-b52e-4acf-ba1b-a7616b583413",
    "account_type": "free",
    "created": "2023-03-24T12:20:04.734709868Z",
    "updated": "2023-03-24T12:20:04.734709868Z",
    "premium_data": 0,
    "quota": 0,
    "usage": 0,
    "warp_plus": true,
    "referral_count": 0,
    "referral_renewal_countdown": 0,
    "role": "child",
    "license": "46Gpua93-E5Wp180d-A895mnh4"
  },
  "config": {
    "client_id": "+bAB",
    "peers": [
      {
        "public_key": "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=",
        "endpoint": {
          "v4": "162.159.192.8:0",
          "v6": "[2606:4700:d0::a29f:c008]:0",
          "host": "engage.cloudflareclient.com:2408"
        }
      }
    ],
    "interface": {
      "addresses": {
        "v4": "172.16.0.2",
        "v6": "2606:4700:110:881d:ccfb:47bd:7a97:73cb"
      }
    },
    "services": {
      "http_proxy": "172.16.0.1:2480"
    }
  },
  "token": "54a248cb-2a18-4171-8fe0-41e815b85168",
  "warp_enabled": true,
  "waitlist_enabled": false,
  "created": "2023-03-24T12:20:04.239101532Z",
  "updated": "2023-03-24T12:20:04.239101532Z",
  "tos": "2023-03-24T12:20:03.516+08:00",
  "place": 0,
  "locale": "en-US",
  "enabled": true,
  "install_id": "iqxxn4umssp",
  "fcm_token": "iqxxn4umssp:APA91bsjbwl5kk4aa7dczkyghm5kr8bs0rq5nubmuj688j816e1ljmvya5y50vk6djehrqxyqio171lcfqmieunzpybkhzd2gtcdxl1sb7f1pc59lbpgbdq54pwall1a0o5x1m0lkoxm",
  "uid": {
    "key": "DAVemWOQZBonokPo7H1jiM61STpRUNYv0N0q27Uztgg=",
    "install_id": "iqxxn4umssp",
    "fcm_token": "iqxxn4umssp:APA91bsjbwl5kk4aa7dczkyghm5kr8bs0rq5nubmuj688j816e1ljmvya5y50vk6djehrqxyqio171lcfqmieunzpybkhzd2gtcdxl1sb7f1pc59lbpgbdq54pwall1a0o5x1m0lkoxm",
    "referrer": "",
    "warp_enabled": true,
    "tos": "2023-03-24T12:20:03.516+08:00",
    "model": "Xiaomi POCO X2",
    "type": "Android",
    "locale": "en_US"
  },
  "wgconf": "[Interface]\n# PrivateKey =\nPublicKey = DAVemWOQZBonokPo7H1jiM61STpRUNYv0N0q27Uztgg=\nAddress = 172.16.0.2\nAddress = 2606:4700:110:881d:ccfb:47bd:7a97:73cb\nDNS = 1.1.1.1\n[Peer]\nPublicKey = bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=\nEndpoint = 162.159.192.8:0\nEndpoint = [2606:4700:d0::a29f:c008]:0\nEndpoint = engage.cloudflareclient.com:2408\nAllowedIPs = 0.0.0.0/0\nAllowedIPs = ::/0\n"
}
  */
  return await res.json();
}

function conf(data) {
  // uid here is its json representation
  const { uid, config } = data;
  if (!config || !uid) {
    console.log(data);
    throw new Error("config or uid missing");
  }
  return `[Interface]
# PrivateKey =
PublicKey = ${uid.key}
Address = ${config.interface.addresses.v4}
Address = ${config.interface.addresses.v6}
DNS = 1.1.1.1
[Peer]
PublicKey = ${config.peers[0].public_key}
Endpoint = ${config.peers[0].endpoint.v4}
Endpoint = ${config.peers[0].endpoint.v6}
Endpoint = ${config.peers[0].endpoint.host}
AllowedIPs = 0.0.0.0/0
AllowedIPs = ::/0
`;
}

/**
 * @param {URLSearchParams} params
 */
async function quota(params) {
  const id = params.get("id");
  const token = params.get("token");
  const j = await info(id, token);
  return modres.mkJsonResponse(j.account);
}

// types

class UserId {
  constructor(pubkey, referrer, device, locale) {
    this.pubkey = pubkey;
    this.referrer = referrer || "";
    this.install = genString(11);
    this.fcm = `${this.install}:APA91b${genString(134)}`;
    // "2023-03-23T19:38:09.711+08:00" (ISO 8601)
    this.time = new Date().toISOString().replace("Z", "+08:00");
    this.device = device || "Xiaomi POCO X2";
    this.os = "Android";
    this.locale = locale || "en_US";
  }

  json() {
    return {
      key: this.pubkey,
      install_id: this.install,
      fcm_token: this.fcm,
      referrer: this.referrer,
      warp_enabled: true,
      tos: this.time,
      model: this.device,
      type: this.os,
      locale: this.locale,
    };
  }
}
