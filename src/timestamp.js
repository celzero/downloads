/*
 * Copyright (c) 2022 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export function isValidFileTimestamp(ts) {
  try {
    // re: Date.now() stackoverflow.com/a/58491358
    return ts <= Date.now();
  } catch (ex) {
    return false;
  }
}

export function fullTimestampFrom(tstamp, defaultvalue) {
  try {
    const ver = parseInt(tstamp) || parseInt(defaultvalue);
    const d = new Date(ver);
    // r2path = "2022/1655832359111"
    // keep in sync with serverless-dns/blocklists:upload.js
    return d.getUTCFullYear() + "/" + ver;
  } catch (ex) {
    return null;
  }
}
