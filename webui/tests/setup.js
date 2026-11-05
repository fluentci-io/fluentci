import { expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { server } from "./server";

expect.extend(matchers);

// Node 25 also exposes a placeholder localStorage; give JSDOM an isolated store.
const storage = new Map();
vi.stubGlobal("localStorage", {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
  key: (index) => [...storage.keys()][index] ?? null,
  get length() {
    return storage.size;
  },
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
Element.prototype.scrollIntoView = vi.fn();
URL.createObjectURL = vi.fn(() => "blob:studio-test");
URL.revokeObjectURL = vi.fn();

afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  vi.restoreAllMocks();
});
