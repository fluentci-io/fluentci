import { assertEquals } from "https://deno.land/std@0.206.0/assert/mod.ts";
import { versionGreaterThan } from '../src/cmd/upgrade.ts'

Deno.test("semver comparasion", () => {
    const tests = [
        {
            v1: "v0.10.1",
            v2: "v0.10.2",
            want: false
        },
        {
            v1: "v0.10.2",
            v2: "v0.10.1",
            want: true
        },
        {
            v1: "v2.10.1",
            v2: "v0.10.1",
            want: true
        },
        {
            v1: "v0.10.0",
            v2: "v0.10.0",
            want: false
        },
    ]

    tests.forEach((tt) => {
        const res = versionGreaterThan(tt.v1, tt.v2)
        assertEquals(res, tt.want)
    })
});