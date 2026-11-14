export interface Pipeline<T> { readonly name: string; readonly steps: readonly unknown[]; readonly __output?: T }
export declare function pipeline(name: string): Pipeline<void>;
export declare function workdir<T>(pipeline: Pipeline<T>, path: string): Pipeline<T>;
export declare function env<T>(pipeline: Pipeline<T>, key: string, value: string): Pipeline<T>;
export declare function exec<T>(pipeline: Pipeline<T>, argv: readonly string[]): Pipeline<string>;
export declare function map<A,B>(pipeline: Pipeline<A>, project: (value: A) => B): Pipeline<B>;
export declare function ensuring<T>(pipeline: Pipeline<T>, cleanup: (value: T | undefined) => void): Pipeline<T>;
export declare function run<T>(pipeline: Pipeline<T>): T;
