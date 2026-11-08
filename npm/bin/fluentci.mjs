#!/usr/bin/env node
import { spawn } from "node:child_process";
import { ensureBinary } from "../lib/install.mjs";

try {
  const executable = await ensureBinary();
  const child = spawn(executable, process.argv.slice(2), { stdio: "inherit" });
  const handlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    const forward = () => child.kill(signal);
    handlers.set(signal, forward);
    process.on(signal, forward);
  }
  const cleanup = () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
  child.on("error", (error) => {
    cleanup();
    console.error(`Could not start FluentCI: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("close", (code, signal) => {
    cleanup();
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code !== null && code >= 0 ? code : 1;
  });
} catch (error) {
  console.error(`Could not install FluentCI: ${error.message}`);
  process.exitCode = 1;
}
