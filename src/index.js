// downloads powered by STORE_URL and/or R2 bindings

const jsonHeader = {"content-type": "application/json;charset=UTF-8"}
const response502 = new Response(null, {status: 502})
const response503 = new Response(null, {status: 503})

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
  }

  const furl = env.STORE_URL + "blocklists/"
  const aurl = env.STORE_URL + "androidapp/"
  const paths = path.split("/")

  let type = (paths && paths.length >= 1) ? paths[1] : ""
  let version = (paths && paths.length >= 2) ? paths[2] : ""

  const down = type && type.length > 0
  if (down && (!version || version.length == 0 || isNaN(version))) {
    version = (type === "app") ? env.LATEST_VCODE : env.LATEST_TSTAMP
  }

  let ttl = 10800 // 60 * 60 * 3hr
  let contentType = "blob"
  if (type === "app") {
    url = aurl + version + ".apk"
    filename = "rethinkdns" + version + ".apk"
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

  const r1 = await fetch(url, {
      // note: cacheTtlByStatus is enterprise-only
      cf: { cacheTtl: ttl },
    })

  if (!r1 || !r1.ok) {
    return response502
  }

  // 1. Make the headers mutable by re-constructing the Response
  // https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams#attaching_a_reader
  // 2. Stream the response to let cf evict this worker from memory, sooner.
  // https://blog.cloudflare.com/workers-optimization-reduces-your-bill/
  // https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams#attaching_a_reader
  if (r1.body) {
    // do not await on r1! see #2 above
    const r2 = new Response(r1.body, r1)
    // TODO: remove aws headers
    // etag:"d1d8dd2aa848850d"
    // server:AmazonS3
    // via:1.1 8d7abc44a23ca8.cloudfront.net (CloudFront)
    // x-amz-cf-id:HwcT01tAWlC8otWjNHOX2bApjw
    // x-amz-cf-pop:ORD51-C3
    // x-amz-server-side-encryption:AES256
    // x-cache:Hit from cloudfront
    asAttachment(r2.headers, filename)
    withContentType(r2.headers, contentType)
    allowCors(r2.headers)
    return r2
  }

  return response503
}

function asAttachment(h, n) {
  if (!h) return
  h.set("content-disposition", "attachment; filename=\"" + n +"\"")
}

function withContentType(h, typ) {
  if (!h || !typ) return
  if (typ === "blob") {
    h.set("content-type", "application/octet-stream")
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

function isValidFileTimestamp(ts) {
  try {
    // re: Date.now() https://stackoverflow.com/a/58491358
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
