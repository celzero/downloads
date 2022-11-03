/*
 * Copyright (c) 2022 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as modup from "./update.js"
import * as moddown from "./download.js"
// downloads powered by STORE_URL and/or R2 bindings

async function handleRequest(request, env) {

  // TODO: handle preflight requests
  // developers.cloudflare.com/workers/examples/cors-header-proxy
  const r = new URL(request.url)

  const path = r.pathname
  const params = r.searchParams

  if (path.startsWith("/update")) {
    return modup.handleUpdateRequest(params, path, env)
  } else {
    return moddown.handleDownloadRequest(params, path, env)
  }
}

export default {
  async fetch(req, env, ctx) {
    return handleRequest(req, env);
  },
}
