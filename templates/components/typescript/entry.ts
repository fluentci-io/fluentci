export interface HelloArgs { /** Name to greet. */ name: string; }
/** Greet someone from a native Wasm component. */
export function hello(args: HelloArgs): string { return `Hello, ${args.name}!`; }
