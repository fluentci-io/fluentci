export function fixture(env = {}, input = "") {
  const calls = [];
  const output = [];
  globalThis.Memory = {
    fromString: (value) => ({ offset: value }),
    find: (value) => ({ readString: () => value }),
  };
  globalThis.Host = {
    inputString: () => input,
    outputString: (value) => output.push(value),
    getFunctions: () =>
      new Proxy(
        {},
        {
          get: (_target, name) => (value) => {
            calls.push([name, value]);
            if (name === "has_env")
              return JSON.stringify(Object.hasOwn(env, value));
            if (name === "get_env") return env[value];
            if (name === "pipeline") return JSON.stringify({ id: "fixture" });
            if (name === "stdout") return "configured";
            return "";
          },
        },
      ),
  };
  return { calls, output };
}
