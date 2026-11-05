export const encodeSegment = encodeURIComponent;
export const parseEvents = left => right => body => {
  try {
    return right(body.split("\n").filter(line => line.length > 0).map(line => JSON.parse(line)));
  } catch (_) {
    return left("malformed event journal");
  }
};
const requestWithKey = key => config => binary => method => path => body => (onError, onSuccess) => {
  const controller = new AbortController();
  let cancelled = false;
  let timer;
  let problem = "invalid client configuration";
  (async () => {
    try {
      const base = new URL(config.baseUrl);
      if (!["http:", "https:"].includes(base.protocol) || base.username || base.password ||
          base.search || base.hash || (base.pathname !== "/" && base.pathname !== "")) {
        throw new Error("baseUrl must be an HTTP(S) origin without credentials, query, or path");
      }
      if (!Number.isInteger(config.timeoutMs) || config.timeoutMs <= 0) throw new Error("timeoutMs must be positive");
      if (key !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw new Error("invalid idempotency key");
      problem = "request failed" + (method === "POST" && path === "/v1/runs" ? "; submission outcome may be unknown" : "");
      timer = setTimeout(() => controller.abort(), config.timeoutMs);
      const response = await fetch(new URL(path, base), {
        method, headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json",
          ...(key === null ? {} : { "Idempotency-Key": key }) },
        body: body === "" ? undefined : body, signal: controller.signal, redirect: "error",
      });
      const payload = binary && response.ok
        ? { body: "", bytes: Array.from(new Uint8Array(await response.arrayBuffer())) }
        : { body: await response.text(), bytes: [] };
      if (!cancelled) onSuccess({ status: response.status, ...payload, nextCursor: response.headers.get("X-Next-Cursor") ?? "0", idempotencyKey: response.headers.get("Idempotency-Key") ?? "" });
    } catch (_) {
      if (!cancelled) onError(new Error(controller.signal.aborted ? "request timed out" : problem));
    } finally {
      clearTimeout(timer);
    }
  })();
  return (_error, _onError, onSuccess) => {
    cancelled = true;
    clearTimeout(timer);
    controller.abort();
    onSuccess();
  };
};

export const requestImpl = requestWithKey(null);
export const requestWithKeyImpl = requestWithKey;
