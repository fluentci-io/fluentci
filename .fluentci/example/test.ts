import { assertEquals } from "https://deno.land/std@0.204.0/assert/mod.ts";

function add(x: number, y: number) {
  return x + y;
}

Deno.test(function addTest() {
  assertEquals(add(2, 3), 5);
});
