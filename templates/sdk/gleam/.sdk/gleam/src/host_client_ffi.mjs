export function valid_id(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
}

// Bound decoded response bytes too: Content-Length alone cannot constrain
// chunked or compressed replies. The deadline covers headers AND the body.
async function read_body(response) {
  const maximum = 16 * 1024 * 1024;
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return bytes;
      }
      total += value.byteLength;
      if (total > maximum) throw Error("response limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function perform(config, method, id, suffix, body, key, ok, error, trace = {}) {
  const controller = new AbortController();
  let timer, response, payload, problem = "invalid client configuration";
  try {
    const base = new URL(config.base_url);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password ||
        base.search || base.hash || base.pathname !== "/" ||
        !Number.isSafeInteger(config.timeout_ms) || config.timeout_ms <= 0 || config.timeout_ms > 2147483647 ||
        !config.token || /[\r\n]/.test(config.token)) throw Error("configuration");
    const submission = method === "POST" && suffix === "" && id === "";
    const collection = submission || (method === "GET" && id === "" && suffix.startsWith("?limit="));
    if (!collection && !valid_id(id)) throw Error("invalid run id");
    if (key !== "" && !/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw Error("invalid key");
    problem = submission ? "request failed; submission outcome may be unknown" : "request failed";
    timer = setTimeout(() => controller.abort(), config.timeout_ms);
    response = await fetch(new URL(`/v1/runs${collection ? suffix : `/${id}${suffix}`}`, base), {
      method,
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json",
        ...(key === "" ? {} : { "Idempotency-Key": key }), ...trace },
      body: body === "" ? undefined : body,
      signal: controller.signal,
      redirect: "error",
    });
    payload = await read_body(response);
  } catch (_) {
    return error(controller.signal.aborted ? `${problem}; request timed out` : problem);
  } finally {
    clearTimeout(timer);
  }
  // Keep user callbacks outside the transport catch so programming failures are
  // not silently converted into network errors.
  return ok(response, payload);
}

export function request(config, method, id, suffix, body, key, ok, error) {
  return perform(config, method, id, suffix, body, key, (response, bytes) =>
    ok(response.status, new TextDecoder().decode(bytes), response.headers.get("Idempotency-Key") ?? ""), error);
}

export function logs(config, id, index, stream, cursor, ok, invalid, http_error, transport_error) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= 10000 ||
      !Number.isSafeInteger(cursor) || cursor < 0 ||
      !["stdout", "stderr", "probe_stdout", "probe_stderr"].includes(stream)) {
    return Promise.resolve(transport_error("invalid log index or cursor"));
  }
  return perform(config, "GET", id, `/logs/${index}/${stream}?cursor=${cursor}`, "", "", (response, bytes) => {
    if (response.status !== 200) return http_error(response.status, new TextDecoder().decode(bytes));
    const header = response.headers.get("X-Next-Cursor");
    const next = Number(header);
    if (!header || !/^(0|[1-9][0-9]*)$/.test(header) || !Number.isSafeInteger(next) ||
        next !== cursor + bytes.byteLength || bytes.byteLength > 1024 * 1024) return invalid();
    return ok(bytes, next);
  }, transport_error);
}

export function events(config, id, cursor, ok, invalid, http_error, transport_error) {
  if (!Number.isSafeInteger(cursor) || cursor < 0) return Promise.resolve(transport_error("invalid event cursor"));
  return perform(config, "GET", id, `/events?cursor=${cursor}`, "", "", (response, bytes) => {
    if (response.status !== 200) return http_error(response.status, new TextDecoder().decode(bytes));
    const header = response.headers.get("X-Next-Cursor"), next = Number(header);
    if (!header || !/^(0|[1-9][0-9]*)$/.test(header) || !Number.isSafeInteger(next) ||
        next !== cursor + bytes.byteLength || bytes.byteLength > 4 * 1024 * 1024) return invalid();
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { return invalid(); }
    return ok(text, next);
  }, transport_error);
}


export function submit_request(config, body, key, traceparent, tracestate, ok, error) {
  // Only the two propagation fields are forwarded. Do not accept arbitrary
  // caller-controlled headers that could replace authorization or request keys.
  if ([traceparent, tracestate].some(value => value.length > 512 || /[^\x20-\x7e]/.test(value)) ||
      (traceparent === "" && tracestate !== "")) {
    return Promise.resolve(error("invalid trace-context headers"));
  }
  const trace = traceparent === "" ? {} : { traceparent, ...(tracestate === "" ? {} : { tracestate }) };
  return perform(config, "POST", "", "", body, key, (response, bytes) =>
    ok(response.status, new TextDecoder().decode(bytes), response.headers.get("Idempotency-Key") ?? ""), error, trace);
}


export function history(config, limit, before, ok, error) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) return Promise.resolve(error("history limit must be 1-200"));
  let query;
  try { query = `?limit=${limit}` + (before === "" ? "" : `&before=${encodeURIComponent(before)}`); }
  catch { return Promise.resolve(error("invalid history cursor encoding")); }
  return request(config, "GET", "", query, "", "", ok, error);
}
