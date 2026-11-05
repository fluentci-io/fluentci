export const executeImpl = invoke => makeError => left => right => directory => encoded => () => {
  try {
    if (!directory || directory.includes("\0")) return left(makeError("invalid-input")("execute_plan")("A fresh run directory is required"));
    const request = JSON.stringify({ plan: JSON.parse(encoded), run_dir: directory });
    return right(invoke("execute_plan")(request)());
  } catch (error) {
    return left(makeError(error.kind || "host-failure")(error.operation || "execute_plan")(error.message || String(error)));
  }
};
