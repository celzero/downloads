/*
 * Copyright (c) 2022 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { bareTimestampFrom } from "./timestamp.js";
// es-lint-file-ignore
import trieconfig from "./u6-basicconfig.json" assert { type: "json" };

// debug logs
export const debug = true;

// use r2 with its http url or r2 bindings?
export let r2Http = true;
// no double forward-slash // unlike http
export const r2proto = "r2:";

// are we running on Workers or Snippets?
export let possiblySnippets = false;

// github.com/serverless-dns/trie/blob/4032130d6/src/codec.js
// even though these aren't equal to the ones defined in trie/codec.js
// (aka b6 = 6 / b8 = 8) they denote the same thing (ie, the same codec).
export const u6 = "u6";
export const u8 = "u8";

export const blocklistsDir = "blocklists";
export const testBlocklistsDir = "testblocklists";

// unused for now
// the last version code beyond which new blocklists won't be delivered
export const lastLegacyBlocklistVcode = 22; // v053k
// last legacy blocklist version (without discards for wildcard entries)
// ie, blocklists generated after 16 Jan 2023 only persist wildcard entries;
// and apps below lastLegacyBlocklistVcode do not support it
export const latestLegacyTimestamp = 1673214982927; // 8 Jan 2023

// blocklists below this version are on s3, the rest on r2
export const lastVersionOnS3 = 1666666666666; // 25 Oct 2022
// the last version code that supports u8-encoded blocklists only
export const lastU8OnlyVcode = Number.MAX_VALUE; // unknown
// fallback timestamp if latest isn't retrieved by pre.sh
export const fallbackTimestamp = 1668635781244; // 16 Nov 2022
// the last apk version code uploaded to S3
export const lastVcodeApkOnS3 = 22; // v053k
// the first version since legacy filetag is published alongside new filetag
// note: this timestamp / version is a random date before the first legacy
// filetag (ie, 24 Nov 2021) but after the first new filetag (ie, 8 Nov 2022)
export const firstVersionWithLegacyFiletag = 1669210235259; // 23 Nov 2022

export function latestTimestamp() {
  // not using fallbackTimestamp will result in an exception whenever
  // trieConfig.timestamp is not a valid timestamp / version
  const t = bareTimestampFrom(trieconfig.timestamp, fallbackTimestamp);
  return (t > fallbackTimestamp) ? t : fallbackTimestamp;
}


export function wrap(env) {
  let cenv = {};
  if (env == null) {
    if (debug) console.debug("env is null");
  } else if (typeof env !== "object") {
    if (debug) console.debug("env is not an object");
  } else {
    // no-op
    if (debug) console.debug("copy env");
    cenv = env;
  }

  if (debug) {
    const w = cenv.WARP_ACTIVE
    const v = cenv.LATEST_VCODE;
    const r2 = cenv.R2_RDNS != null;
    const cf = navigator && navigator.userAgent === "Cloudflare-Workers";
    console.debug("cfg: warp?", w, "vcode", v, "r2?", r2, "workers?", cf);
  }

  // values from 17 May 2023
  if (cenv.WARP_ACTIVE == null) cenv.WARP_ACTIVE = "true";
  if (cenv.LATEST_VCODE == null) cenv.LATEST_VCODE = "41";
  if (cenv.GEOIP_TSTAMP == null) cenv.GEOIP_TSTAMP = "1667349639157";
  if (cenv.STORE_URL == null) cenv.STORE_URL = "https://dist.rethinkdns.com/";
  if (cenv.R2_STORE_URL == null) cenv.R2_STORE_URL = "https://cfstore.rethinkdns.com/";

  if (cenv.R2_RDNS == null) {
    cenv.R2_RDNS = null; // may be undefined
    r2Http = true; // always true when env/r2 bindings are not available
    possiblySnippets = true; // env is always missing on snippets (alpha)
  }

  return cenv;
}
