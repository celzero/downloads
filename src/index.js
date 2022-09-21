// downloads powered by STORE_URL and/or R2 bindings

const jsonHeader = {"content-type": "application/json;charset=UTF-8"}
const response502 = new Response(null, {status: 502})
const response503 = new Response(null, {status: 503})
const r2proto = "r2:"

function checkForAppUpdates(params, latestVersionCode) {
  const res = {
    "version":"1",
    "update":"false",
    "latest":latestVersionCode,
  }

  if (params) {
    let appVersionCode = params.get("vcode") || Number.MAX_VALUE
    res.update = shouldUpdateApp(latestVersionCode, appVersionCode)
  }

  const resJson = JSON.stringify(res, /*replacer*/null, /*space*/2)

  const response = new Response(resJson, { headers: jsonHeader })

  allowCors(response.headers)

  return response
}

function checkForBlocklistsUpdates(params, latestTimestamp) {
  const res = {
    "version":"1",
    "update":"false",
    "latest":latestTimestamp,
  }

  if (params && params.has("tstamp")) {
    let fileTimestamp = params.get("tstamp")
    res.update = shouldUpdateBlocklists(latestTimestamp, fileTimestamp)
    // TODO: does the vcode support latestTimestamp?
    // TODO: in case appVersionCode = 0, err out
    // appVersionCode = params.get("vcode") || 0
  }

  const resJson = JSON.stringify(res, /*replacer*/null, /*space*/2)

  const response = new Response(resJson, { headers: jsonHeader })

  allowCors(response.headers)

  return response
}

// geoipver is a unix timestamp "1655832359111"
function checkForGeoipUpdates(params, geoipver) {
  const res = {
    "version":"1",
    "update":"false",
    "latest":geoipver,
  }

  if (params) {
    // rcvdPath = "1655832359111"
    const rcvdPath = params.get("tstamp") || "0"
    // r2PathOf may return null
    res.update = shouldUpdateGeoip(r2PathOf(geoipver), r2PathOf(rcvdPath))
  }

  const resJson = JSON.stringify(res, /*replacer*/null, /*space*/2)

  const response = new Response(resJson, { headers: jsonHeader })

  allowCors(response.headers)

  return response
}

async function handleRequest(request, env) {

  // TODO: handle preflight requests
  // https://developers.cloudflare.com/workers/examples/cors-header-proxy
  const r = new URL(request.url)

  const path = r.pathname
  const params = r.searchParams

  // default download and file
  let url = env.STORE_URL + "androidapp/" + env.LATEST_VCODE + ".apk"
  let filename = "rethinkdns-" + env.LATEST_VCODE + ".apk"

  if (path === "/update/app") {
    return checkForAppUpdates(params, env.LATEST_VCODE)
  } else if (path === "/update/blocklists") {
    return checkForBlocklistsUpdates(params, env.LATEST_TSTAMP)
  } else if (path === "/update/geoip") {
    return checkForGeoipUpdates(params, env.GEOIP_TSTAMP)
  }

  const furl = env.STORE_URL + "blocklists/"
  const aurl = env.STORE_URL + "androidapp/"
  const gurl = r2proto // no double forward-slash // unlike http
  // type = ["geoip", "app", "blocklists", "basicconfig", "rank", trie"]
  // version = usually a unix timestamp
  const [type, version] = determineIntent(path, env)

  let ttl = 10800 // 60 * 60 * 3hr
  let contentType = determineContentType(params)
  if (type === "geoip") {
    const v6 = params.has("v6")
    const v4 = params.has("v4")
    const asn64 = params.has("asn")
    // r2:version/dbip.v6 where version is of form 2022/143432432
    if (asn64) {
      url = gurl + version + "/asn.v64"
      filename = "asn.v64"
    } else {
      url = gurl + version + (v6 ? "/dbip.v6" : "/dbip.v4")
      filename = v6 ? "dbip.v6" : "dbip.v4"
    }
    ttl = 2592000 // 60 * 60 * 720hr
  } else if (type === "app") {
    url = aurl + version + ".apk"
    filename = "rethinkdns" + version + ".apk"
    // always blob, never compressed?
    // contentType = "blob"
  } else if (type === "blocklists") {
    url = furl + version + "/filetag.json"
    filename = "filetag.json"
    contentType = "json"
    ttl = 2592000 // 60 * 60 * 720hr
  } else if (type === "basicconfig") {
    url = furl + version + "/basicconfig.json"
    filename = "basicconfig.json"
    contentType = "json"
    ttl = 2592000 // 60 * 60 * 720hr
  } else if (type === "rank") {
    url = furl + version + "/rd.txt"
    filename = "rank.bin"
    ttl = 2592000 // 60 * 60 * 720hr
  } else if (type === "trie") {
    url = furl + version + "/td.txt"
    filename = "trie.bin"
    ttl = 2592000 // 60 * 60 * 720hr
  } else if (type === "bloom") {
    url = furl + version + "/bloom_buckets.txt"
    filename = "bloom.bin"
    ttl = 2592000 // 60 * 60 * 720hr
  } else {
      // FIXME: change the website to reflect the fact
      // that default is now err and not apk download
      // return err("no such path")
  }

  const res1 = await doDownload(url, ttl, env.R2_GEOIP)
  if (!res1 || !res1.ok) {
    return response502
  }

  // 1. Make the headers mutable by re-constructing the Response
  // 2. Stream the response to let cf evict this worker from memory, sooner.
  // blog.cloudflare.com/workers-optimization-reduces-your-bill/
  // developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams#attaching_a_reader
  if (res1.body) {
    // do not await on res1! see #2 above
    const res2 = new Response(res1.body, res1)
    // TODO: remove aws headers
    // etag:"d1d8dd2aa848850d"
    // server:AmazonS3
    // via:1.1 8d7abc44a23ca8.cloudfront.net (CloudFront)
    // x-amz-cf-id:HwcT01tAWlC8otWjNHOX2bApjw
    // x-amz-cf-pop:ORD51-C3
    // x-amz-server-side-encryption:AES256
    // x-cache:Hit from cloudfront
    asAttachment(res2.headers, filename)
    withContentType(res2.headers, contentType)
    allowCors(res2.headers)
    return res2
  }

  console.warn("download for", url, "failed, no body w res", res1)
  return response503
}

function determineContentType(params) {
  const compressed = params.get("compressed") != null
  return (compressed) ? "compressable-blob" : "blob"
}

function determineIntent(path, env) {
  let type = null
  let version = null
  if (!path || path.length <= 0) {
    console.warn("intent: undetermined; zero path")
    return [type, version]
  }

  const paths = path.split("/")
  const p1 = (paths && paths.length > 1) ? paths[1] : ""
  const p2 = (p1 && paths.length > 2) ? paths[2] : ""

  if (p1 === "geoip") {
    type = p1
    version = r2PathOf(p2, env.GEOIP_TSTAMP)
  } else if (p1 === "app") {
    type = p1
    version = p2 || env.LATEST_VCODE
  } else if (p1.length > 0) {
    // one among: blocklists, rank, trie, basicconfig, bloom
    type = p1
    version = r2PathOf(p2, env.LATEST_TSTAMP)
  } else {
    console.warn("intent: unknown; path not set", path)
  }

  return [type, version]
}

function r2PathOf(tstamp, defaultvalue) {
    try {
      const ver = parseInt(tstamp || defaultvalue)
      const d = new Date(ver)
      // r2path = "2022/1655832359111"
      return d.getUTCFullYear() + "/" + ver
    } catch(ex) {
      return null
    }
}

// ref: github.com/kotx/render/blob/0a841f6/src/index.ts
async function doDownload(url, ttl, r2geoip) {
  if (url && url.startsWith(r2proto)) {
    // slice out the prefix r2: from url
    const key = url.slice(url.indexOf(":") + 1)
    // developers.cloudflare.com/r2/runtime-apis/#bucket-method-definitions
    const r2obj = await r2geoip.get(key)
    // developers.cloudflare.com/r2/runtime-apis/#r2object-definition
    const ok = (r2obj.size > 0)
    if (ok) {
      // console.debug("r2obj sz:", r2obj.size, " k:", r2obj.key, "v:", r2obj.version)
      return new Response(r2obj.body)
    } else {
      console.warn("r2 size", r2obj.size, "not ok for", key)
      return new Response(null, { status:500 })
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

function asAttachment(h, n) {
  if (!h) return
  h.set("content-disposition", "attachment; filename=\"" + n +"\"")
}

function withContentType(h, typ) {
  if (!h || !typ) return
  if (typ === "blob") {
    h.set("content-type", "application/octet-stream")
  } else if (typ === "compressable-blob") {
    // cf does not compress octet-streams: archive.is/CDnBh
    // but compresses application/wasm: archive.is/rT2pZ
    h.set("content-type", "application/wasm")
  } else if (typ === "json") {
    h.set("content-type", "application/json;charset=UTF-8")
  }
}

function allowCors(h) {
  if (!h) return
  // developers.cloudflare.com/workers/examples/cors-header-proxy
  // r.origin  => protocol//<subdomain>.<rootdomain>.<tld> => https://download.bravedns.com
  // which is not what we want. We instead need just the rootdomain: https://bravedns.com
  // but that's complicated: https://stackoverflow.com/questions/8498592/ and so, hard-code
  // our way out of this quagmire, since we know all our domains are ".com" TLDs.
  // see also: https://stackoverflow.com/questions/14003332/
  // corsheader = r.origin
  h.set("Access-Control-Allow-Origin", '*')
  h.append('Vary', 'Origin')
}

function echo(str) {
  const res = {
    "version":"1",
    "echo": str
  }

  const resJson = JSON.stringify(res, /*replacer*/null, /*space*/2)

  return new Response(resJson, { headers: jsonHeader })
}

function shouldUpdateApp(latest, current) {
  try {
    latest = parseInt(latest)
    current = parseInt(current)
  } catch (ex) {
    // couldn't convert vcode to numbers, probably malformed
    // inform the client to update to the latest vcode.
    return "true"
  }
  return (latest > current).toString()
}

function shouldUpdateBlocklists(latest, current) {
  try {
    latest = parseInt(latest)
    current = parseInt(current)
  } catch (ex) {
    // couldn't convert tstamps to numbers, probably malformed
    // inform the client to update to the latest tstamp.
    return "true"
  }
  // client's tstamp invalid; course-correct.
  if (!isValidFileTimestamp(current)) return "true"

  return (latest > current).toString()
}

function shouldUpdateGeoip(latest, current) {
  if (latest == null || current == null) return "true"
  try {
    // ex: l_split -> ["2022", "1655832359"]
    const l_split = latest.split("/")
    const c_split = current.split("/")
    latest = parseInt(l_split[1])
    current = parseInt(c_split[1])
  } catch (ex) {
    console.warn("geoip ver", current, latest, "parse err", ex)
    // couldn't convert vcode to numbers, probably malformed
    // inform the client to update to the latest vcode.
    return "true"
  }
  return (latest > current).toString()
}

function isValidFileTimestamp(ts) {
  try {
    // re: Date.now() stackoverflow.com/a/58491358
    return ts <= Date.now()
  } catch (ex) {
    return false
  }
}

function err(reason) {
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


export default {
  async fetch(req, env, ctx) {
    return handleRequest(req, env);
  },
}
