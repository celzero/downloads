/*
 * Copyright (c) 2022 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// use r2 with its http url or r2 bindings?
export const r2Http = true;
// no double forward-slash // unlike http
export const r2proto = "r2:";

// blocklists below this version are on s3, the rest on r2
export const lastVersionOnS3 = 1666666666666; // Oct 25, 2022
// the last version code that supports u8-encoded blocklists only
export const lastU8OnlyVcode = Number.MAX_VALUE; // unknown
// the last version code beyond which updates won't be delivered
export const lastNoBlocklistUpdatesVcode = 22; // v053k
// the last apk version code uploaded to S3
export const lastVcodeApkOnS3 = 22; // v053k
