declare type I32 = number;
declare type I64 = bigint;
declare const Host: {
  inputString(): string;
  outputString(value: string): void;
  getFunctions(): Record<string, (...args: any[]) => any>;
};
declare const Memory: {
  fromString(value: string): { offset: bigint };
  find(offset: bigint): unknown;
  readString(value: unknown): string;
};
