/*
 * Copyright (c) 2022 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { lastNoBlocklistUpdatesVcode } from "./cfg.js";
import * as modres from "./res.js";
import {
  isValidBareTimestamp,
  fullTimestampFrom,
  bareTimestampFrom,
} from "./timestamp.js";

export function handleUpdateRequest(params, path, env) {
  if (path === "/update/app") {
    return checkForAppUpdates(params, env.LATEST_VCODE);
  } else if (path === "/update/blocklists") {
    const t = bareTimestampFrom(env.LATEST_TSTAMP);
    return checkForBlocklistsUpdates(params, t);
  } else if (path === "/update/geoip") {
    const t = bareTimestampFrom(env.GEOIP_TSTAMP);
    return checkForGeoipUpdates(params, t);
  }

  return modres.response400;
}

function checkForAppUpdates(params, latestVersionCode) {
  const res = {
    version: "1",
    update: "false",
    latest: latestVersionCode,
  };

  if (params) {
    const appVersionCode = params.get("vcode") || Number.MAX_VALUE;
    res.update = shouldUpdateApp(latestVersionCode, appVersionCode);
  }

  const response = modres.mkJsonResponse(res);
  modres.allowCors(response.headers);

  return response;
}

function checkForBlocklistsUpdates(params, latestTimestamp) {
  const res = {
    version: "1",
    update: "false",
    latest: latestTimestamp,
  };

  const clientvcode = params && params.has("vcode") ? params.get("vcode") : 0;
  const fileTimestamp =
    params && params.has("tstamp") ? params.get("tstamp") : 0;
  // do we still support this vcode?
  if (clientvcode <= lastNoBlocklistUpdatesVcode) {
    res.update = false;
  } else {
    res.update = shouldUpdateBlocklists(latestTimestamp, fileTimestamp);
  }

  const response = modres.mkJsonResponse(res);
  modres.allowCors(response.headers);

  return response;
}

// geoipver is a unix timestamp "1655832359111"
function checkForGeoipUpdates(params, geoipver) {
  const res = {
    version: "1",
    update: "false",
    latest: geoipver,
  };

  if (params) {
    // rcvdPath = "1655832359111"
    const rcvdPath = params.get("tstamp") || "0";
    // r2PathOf may return null
    res.update = shouldUpdateGeoip(
      fullTimestampFrom(geoipver),
      fullTimestampFrom(rcvdPath)
    );
  }

  const response = modres.mkJsonResponse(res);
  modres.allowCors(response.headers);

  return response;
}

function shouldUpdateApp(latest, current) {
  try {
    latest = parseInt(latest);
    current = parseInt(current);
  } catch (ex) {
    // couldn't convert vcode to numbers, probably malformed
    // inform the client to update to the latest vcode.
    return "true";
  }

  if (isNaN(latest) || isNaN(current)) return "true";

  return (latest > current).toString();
}

function shouldUpdateBlocklists(latest, current) {
  try {
    latest = parseInt(latest);
    current = parseInt(current);
  } catch (ex) {
    // couldn't convert tstamps to numbers, probably malformed
    // inform the client to update to the latest tstamp.
    return "true";
  }
  // client's tstamp invalid; course-correct.
  if (!isValidBareTimestamp(current)) return "true";

  return (latest > current).toString();
}

function shouldUpdateGeoip(latest, current) {
  if (latest == null || current == null) return "true";
  try {
    // ex: l_split -> ["2022", "1655832359"]
    const lSplit = latest.split("/");
    const cSplit = current.split("/");
    latest = parseInt(lSplit[1]);
    current = parseInt(cSplit[1]);
  } catch (ex) {
    console.warn("geoip ver", current, latest, "parse err", ex);
    // couldn't convert vcode to numbers, probably malformed
    // inform the client to update to the latest vcode.
    return "true";
  }
  return (latest > current).toString();
}
