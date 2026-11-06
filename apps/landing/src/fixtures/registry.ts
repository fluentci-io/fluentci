import type { Plugin, Profile } from "../registry/client";

export const author: Profile = {
  did: "did:plc:abcdefghijklmnopqrstuvwx",
  handle: "fluentci.io",
  avatar: "/fluentci-logo.png",
};
export const plugin: Plugin = {
  name: "sccache",
  version: "0.1.0",
  description: "Shared compilation caching for fast, reproducible builds.",
  author: author.did,
  publishedAt: "2026-11-06T08:30:00Z",
  license: "MIT",
  url: "https://modules.example/sccache.wasm",
  uri: `at://${author.did}/io.fluentci.plugin/sccache-0.1.0`,
  logo: "/fluentci-logo.png",
  repository: "https://github.com/fluentci-io/fluentci",
  readmeUrl: "https://modules.example/README.md",
  topics: ["cache", "rust"],
  os: ["linux", "macos"],
  arch: ["aarch64", "x86_64"],
  downloads: 1284,
  dailyDownloads: [14, 30, 18, 42, 35, 50, 38].map((downloads, index) => ({
    date: `2026-11-0${index + 1}`,
    downloads,
  })),
  functions: [
    {
      name: "setup",
      description: "Configure compiler caching.",
      args: [],
      returnType: "Unit",
    },
  ],
};
