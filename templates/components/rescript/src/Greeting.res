type helloArgs = {/** Name to greet. */ name: string}
/** Greet someone from a native Wasm component. */
let hello = (args: helloArgs): string => "Hello, " ++ args.name ++ "!"
