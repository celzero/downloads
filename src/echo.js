/*
 * Copyright (c) 2022 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export function echo(str) {
    const res = {
      "version":"1",
      "echo": str
    }
  
    const resJson = JSON.stringify(res, /*replacer*/null, /*space*/2)
  
    return new Response(resJson, { headers: jsonHeader })
  }

export function err(reason) {
    const res = {
      "version":"1",
      "error": reason + "",
    }
  
    const resJson = JSON.stringify(res, /*replacer*/null, /*space*/2)
  
    return new Response(resJson,{
      headers: jsonHeader,
      status: 500,
    })
  }