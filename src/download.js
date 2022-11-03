/*
 * Copyright (c) 2022 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as modres from "./res.js"
import * as cfg from "./cfg.js"
import { fullTimestampFrom } from "./timestamp.js"

export async function handleDownloadRequest(params, path, env) {
  // explicitly compress contents as gz
  const streamType = determineStreamType(params)

  const [url, filename, ttl, contentType] = determineArtifact(params, path, env)

  const res1 = await doDownload(url, ttl, env.R2_RDNS)
  if (!res1 || !res1.ok) {
    console.warn(filename, "download for", url, "failed", contentType)
    return modres.response502
  }

  // 1. Make the headers mutable by re-constructing the Response
  // 2. Stream the response to let cf evict this worker from memory, sooner.
  // blog.cloudflare.com/workers-optimization-reduces-your-bill/
  // developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams#attaching_a_reader
  if (res1.body) {
    const body = modres.asStream(res1.body, streamType)
    // do not await on res1! see #2 above
    const res2 = new Response(body, res1)
    // TODO: remove aws headers
    // etag:"d1d8dd2aa848850d"
    // server:AmazonS3
    // via:1.1 8d7abc44a23ca8.cloudfront.net (CloudFront)
    // x-amz-cf-id:HwcT01tAWlC8otWjNHOX2bApjw
    // x-amz-cf-pop:ORD51-C3
    // x-amz-server-side-encryption:AES256
    // x-cache:Hit from cloudfront
    modres.asAttachment(res2.headers, filename)
    modres.withContentType(res2.headers, contentType)
    modres.allowCors(res2.headers)
    return res2
  }

  console.warn("download for", url, "failed, no body w res", res1)
  return modres.response503
}

function determineArtifact(params, path, env) {
  // type = ["geoip", "app", "blocklists", "basicconfig", "rank", trie"]
  // version = timestampMs, or yyyy/timestampMs, or a number (vcode)
  const [type, version, clientvcode, contentType] = determineIntent(params, path, env)

  let url = null
  let filename = null
  let ttl = 10800 // 60 * 60 * 3hr

  if (type === "geoip") {
    // blob or compressable-blob
    const v6 = params.has("v6")
    const v4 = params.has("v4")
    const asn64 = params.has("asn")
    // gurl: r2:geoip/yyyy/tstamp
    const gurl = determineGeoIpUrl(env, version)
    // r2:version/dbip.v6 where version is of form 2022/143432432
    if (asn64) {
      url = gurl + "/asn.v64"
      filename = "asn.v64"
    } else {
      url = gurl + (v6 ? "/dbip.v6" : "/dbip.v4")
      filename = v6 ? "dbip.v6" : "dbip.v4"
    }
    ttl = 2592000 // 60 * 60 * 720hr
  } else if (type === "blocklists") {
    // json
    // r2:blocklists/yyyy/tstamp/[u6|u8] or https://<url>/blocklists/tstamp
    url = determineStoreUrl(env, version, clientvcode) + "/filetag.json"
    filename = "filetag.json"
    ttl = 2592000 // 60 * 60 * 720hr
  } else if (type === "basicconfig") {
    // json
    // r2:blocklists/yyyy/tstamp/[u6|u8] or https://<url>/blocklists/tstamp
    url = determineStoreUrl(env, version, clientvcode) + "/basicconfig.json"
    filename = "basicconfig.json"
    ttl = 2592000 // 60 * 60 * 720hr
  } else if (type === "rank") {
    // blob or compressable-blob
    // r2:blocklists/yyyy/tstamp/[u6|u8] or https://<url>/blocklists/tstamp
    url = determineStoreUrl(env, version, clientvcode) + "/rd.txt"
    filename = "rank.bin"
    ttl = 2592000 // 60 * 60 * 720hr
  } else if (type === "trie") {
    // blob or compressable-blob
    // r2:blocklists/yyyy/tstamp/[u6|u8] or https://<url>/blocklists/tstamp
    url = determineStoreUrl(env, version, clientvcode) + "/td.txt"
    filename = "trie.bin"
    ttl = 2592000 // 60 * 60 * 720hr
  } else if (type === "bloom") {
    // blob or compressable-blob
    // r2:blocklists/yyyy/tstamp/[u6|u8] or https://<url>/blocklists/tstamp
    url = determineStoreUrl(env, version, clientvcode) + "/bloom_buckets.txt"
    filename = "bloom.bin"
    ttl = 2592000 // 60 * 60 * 720hr
  } else {
    // treat as if (type === "app")
    // always blob, never compressed?
    // contentType = "blob"
    // url: r2:androidapp/version.apk or https://<url>/androidapp/version.apk
    if (!version) throw new Error(version + " not a version in: " + path)
    url = determineAppUrl(env, version)
    filename = "rethink-" + version + ".apk"
  }
  return [url, filename, ttl, contentType]
}

function determineClientvcode(params) {
  if (params) {
    return params.get("vcode") || Number.MAX_VALUE
  }
  return Number.MAX_VALUE
}

function determineContentType(type, params) {
  // type is one among: blocklists, rank, trie, basicconfig, bloom
  if (type === "basicconfig" || type === "blocklists") return "json"
  const compressed = params && params.get("compressed") != null
  return (compressed) ? "compressable-blob" : "blob"
}

function determineStreamType(params) {
  const compressed = params.get("gzipped") != null
  return (compressed) ? "stream-gz" : ""
}

function determineGeoIpUrl(env, version) {
  if (!version) throw new Error("geoip version null " + version);
  const r2src = (cfg.r2Http) ? env.R2_STORE_URL : cfg.r2proto
  return r2src + "geoip/" + version
}

function determineAppUrl(env, version) {
  if (!version) throw new Error("vcode null " + version);
  const r2src = (cfg.r2Http) ? env.R2_STORE_URL : cfg.r2proto

  if (version <= cfg.lastVcodeApkOnS3) {
    return env.STORE_URL + "androidapp/" + version + ".apk"
  } else {
    return r2src + "androidapp/" + version + ".apk"
  }
}

function determineStoreUrl(env, version, clientvcode) {
  if (!version) throw new Error("blocklist version null: " + version);

  // version must be of form yyyy/timestampMs, ex: 2022/1666666666666
  const v = version.split("/")

  if (!v || v.length <= 1) throw new Error("invalid version")

  const timestamp = v[1]
  if (timestamp <= cfg.lastVersionOnS3) {
    return env.STORE_URL + "blocklists/" + timestamp
  }

  const r2src = (cfg.r2Http) ? env.R2_STORE_URL : cfg.r2proto

  // if vcode is not set, assume legacy apk, ie Number.MAX_VALUE
  if (clientvcode <= cfg.lastU8OnlyVcode || clientvcode === Number.MAX_VALUE) {
    return r2src + "blocklists/" + version + "/u8"
  } else {
    return r2src + "blocklists/" + version + "/u6"
  }
}

function determineIntent(params, path, env) {
  // defaults
  let type = "app"
  let version = env.LATEST_VCODE
  let clientvcode = Number.MAX_VALUE
  // use built-in http compression as br / gz
  let contentType = "blob"

  clientvcode = determineClientvcode(params)

  if (!path || path.length <= 0) {
    console.info("intent: undetermined type/version; zero path")
    // return the default type/version/contentType
    return [type, version, clientvcode, contentType]
  }

  const paths = path.split("/")
  const p1 = (paths && paths.length > 1) ? paths[1] : ""
  const p2 = (p1 && paths.length > 2) ? paths[2] : ""

  if (p1 === "geoip") {
    type = p1
    version = fullTimestampFrom(p2, env.GEOIP_TSTAMP)
  } else if (p1 === "app") {
    type = p1
    version = p2 || env.LATEST_VCODE
  } else if (
      p1 === "blocklists" ||
      p1 === "trie" ||
      p1 === "rank" ||
      p1 === "basicconfig" ||
      p1 === "bloom") {
    // one among: blocklists, rank, trie, basicconfig, bloom
    type = p1
    version = fullTimestampFrom(p2, env.LATEST_TSTAMP)
  } else {
    console.warn("intent: unknown; path not set", path)
    // return the default contentType/type/version
    return [type, version, clientvcode, contentType]
  }
  // determine contentType based on "type" and "params"
  return [type, version, clientvcode, determineContentType(type, params)]
}

// ref: github.com/kotx/render/blob/0a841f6/src/index.ts
async function doDownload(url, ttl, r2bucket) {
  if (url && url.startsWith(cfg.r2proto)) {
    // slice out the prefix r2: from url
    const key = url.slice(url.indexOf(":") + 1)
    // developers.cloudflare.com/r2/runtime-apis/#bucket-method-definitions
    const r2obj = await r2bucket.get(key)
    // developers.cloudflare.com/r2/runtime-apis/#r2object-definition
    const ok = (r2obj && r2obj.size > 0)
    if (ok) {
      // console.debug("r2obj sz:", r2obj.size, " k:", r2obj.key, "v:", r2obj.version)
      return new Response(r2obj.body)
    } else {
      console.warn("r2: not ok for", key)
      return modres.response500
    }
  } else if (url && url.startsWith("https:")) {
    return await fetch(url, {
      // note: cacheTtlByStatus is enterprise-only
      cf: { cacheTtl: ttl },
    })
  } else {
    console.warn("do-download: unsupported proto", url);
    return null
  }
}
