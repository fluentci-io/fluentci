export const component = value => encodeURIComponent(value).replace(/[!'()*]/g, char => "%" + char.charCodeAt(0).toString(16).toUpperCase());
export const valid_name = name => /^[A-Za-z0-9_.-]{1,64}$/.test(name);
export function execute_plan(encoded, directory, ok, error) {
  try {
    const fn = Host.getFunctions().execute_plan;
    if (!fn) throw Error("This engine does not expose execute_plan; upgrade the engine");
    const request = JSON.stringify({ plan: JSON.parse(encoded), run_dir: directory });
    return ok(Memory.find(fn(Memory.fromString(request).offset)).readString());
  } catch (exception) { return error(exception instanceof Error ? exception.message : String(exception)); }
}
