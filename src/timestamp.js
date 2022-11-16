/*
 * Copyright (c) 2022 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// do not import any thing from src/ here

// return true if ts is a valid unix epoch type (number)
export function isValidBareTimestamp(ts) {
  try {
    const bare = bareTimestampFrom(ts);
    if (isNaN(bare)) return false;
    // re: Date.now() stackoverflow.com/a/58491358
    return bare <= Date.now();
  } catch (ignored) {}
  return false;
}

// returns true if tstamp is of form yyyy/epochMs
export function isValidFullTimestamp(tstamp) {
  if (typeof tstamp !== "string") return false;
  return tstamp.indexOf("/") === 4;
}

export function bareTimestampFrom(tstamp, defaultvalue) {
  // strip out "/" if tstamp is of form yyyy/epochMs
  if (isValidFullTimestamp(tstamp)) {
    tstamp = tstamp.split("/")[1];
  }
  try {
    const t = parseInt(tstamp);
    if (!isNaN(t)) return t;
  } catch (e) {
    if (defaultvalue == null) throw e;
  }

  // strip out "/" if defaultvalue is of form yyyy/epochMs
  if (isValidFullTimestamp(defaultvalue)) {
    defaultvalue = defaultvalue.split("/")[1];
  }
  const d = parseInt(defaultvalue);
  if (isNaN(d)) {
    throw new Error(tstamp + " bare: tstamp/default invalid " + defaultvalue);
  } else {
    return d;
  }
}

// may return null
export function fullTimestampFrom(tstamp, defaultvalue) {
  try {
    // do nothing, if tstamp is already of the form yyyy/timestampMs
    if (isValidFullTimestamp(tstamp)) return tstamp;

    const ver = parseInt(tstamp) || parseInt(defaultvalue);

    if (isNaN(ver)) return null;

    const d = new Date(ver);
    // r2path = "2022/1655832359111"
    // keep in sync with serverless-dns/blocklists:upload.js
    return d.getUTCFullYear() + "/" + ver;
  } catch (ignored) {}

  return null;
}
