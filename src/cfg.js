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
export const debug = false;

// use r2 with its http url or r2 bindings?
export const r2Http = true;
// no double forward-slash // unlike http
export const r2proto = "r2:";

// github.com/serverless-dns/trie/blob/4032130d6/src/codec.js
// even though these aren't equal to the ones defined in trie/codec.js
// (aka b6 = 6 / b8 = 8)they denote the same thing (ie, the same codec).
export const u6 = "u6";
export const u8 = "u8";

export const blocklistsDir = "blocklists";
export const testBlocklistsDir = "testblocklists";

// unused for now
// the last version code beyond which new blocklists won't be delivered
export const lastLegacyBlocklistVcode = 22; // v053k
// the last legacy timestamp, 16 Nov 2022
// unused since legacy blocklists are supported for a longer period now
export const latestLegacyTimestamp = 1668635781244; // unused

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
