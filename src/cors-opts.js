/*
 * Copyright (c) 2022 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as modres from "./res.js";

export function handleOptionsRequest(request) {
    let headers = request.headers;
    // Make sure the necessary headers are present
    // for this to be a valid pre-flight request
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
    const respHeaders = {
      ...modres.corsHeaders,
      // Allow all future content Request headers to go back to browser
      // such as Authorization (Bearer) or X-Client-Name-Version
      "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers"),
    };
    return new Response(null, { headers: respHeaders });
    } else {
      // Handle standard OPTIONS request.
      return new Response(null, { headers: modres.methodHeaders });
    }
  }

  export function allowMethod(m) {
    return m === "GET" || m === "POST" || m === "HEAD";
  }