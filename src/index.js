/*
 * Copyright (c) 2022 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as modup from "./update.js";
import * as moddown from "./download.js";
import * as modcorsopts from "./cors-opts.js";
import * as modres from "./res.js";

async function handleRequest(request, env) {
  // handle preflight requests
  // developers.cloudflare.com/workers/examples/cors-header-proxy
  if (request.method === "OPTIONS") {
    return modcorsopts.handleOptionsRequest(request);
  }

  if (!modcorsopts.allowMethod(request.method)) return modres.response405;

  const r = new URL(request.url);

  const path = r.pathname;
  const params = r.searchParams;

  if (path.startsWith("/update")) {
    return modup.handleUpdateRequest(params, path, env);
  } else {
    return moddown.handleDownloadRequest(params, path, env);
  }
}

export default {
  async fetch(req, env, ctx) {
    return handleRequest(req, env);
  },
};
