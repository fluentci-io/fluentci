import * as projects from "./server/kv/projects.ts";
import * as actions from "./server/kv/actions.ts";
import { createId } from "../deps.ts";

async function fileExists(path: string): Promise<boolean> {
  try {
    const { isFile } = await Deno.stat(path);
    return isFile;
  } catch (_) {
    return false;
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const { isDirectory } = await Deno.stat(path);
    return isDirectory;
  } catch (_) {
    return false;
  }
}

export default async function detect(src: string): Promise<void> {
  const project = await projects.byName(Deno.env.get("FLUENTCI_PROJECT_ID")!);
  if (project?.path !== "empty" || !project) {
    return;
  }

  if (await fileExists(`${src}/Cargo.toml`)) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "rust",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/rust-plain.svg",
      },
      {
        id: createId(),
        name: "build",
        commands: "build --release",
        enabled: true,
        plugin: "rust",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/rust-plain.svg",
      },
    ]);
    return;
  }

  if (await fileExists(`${src}/go.mod`)) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "go",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/go-original-wordmark.svg",
      },
      {
        id: createId(),
        name: "build",
        commands: "build",
        enabled: true,
        plugin: "go",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/go-original-wordmark.svg",
      },
    ]);
    return;
  }

  if (
    (await fileExists(`${src}/package.json`)) &&
    (await fileExists(`${src}/bun.lockb`))
  ) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "bun",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/bun.svg",
      },
    ]);
    return;
  }

  if (await fileExists(`${src}/package.json`)) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "tests",
        commands: "run test",
        enabled: true,
        plugin: "bun",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/bun.svg",
      },
    ]);
    return;
  }

  if (
    (await fileExists(`${src}/deno.json`)) ||
    (await fileExists(`${src}/deno.jsonc`))
  ) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "fmt",
        commands: "fmt",
        enabled: true,
        plugin: "deno",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/deno.svg",
      },
      {
        id: createId(),
        name: "lint",
        commands: "lint",
        enabled: true,
        plugin: "deno",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/deno.svg",
      },
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "deno",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/deno.svg",
      },
    ]);
    return;
  }

  if (await fileExists(`${src}/gleam.toml`)) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "gleam",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/gleam.png",
      },
      {
        id: createId(),
        name: "build",
        commands: "build",
        enabled: true,
        plugin: "gleam",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/gleam.png",
      },
    ]);
    return;
  }

  if (await fileExists(`${src}/build.zig`)) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "zig",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/zig-original.svg",
      },
      {
        id: createId(),
        name: "build",
        commands: "build",
        enabled: true,
        plugin: "zig",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/zig-original.svg",
      },
    ]);
    return;
  }

  if (await fileExists(`${src}/mix.exs`)) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "elixir",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/elixir.svg",
      },
      {
        id: createId(),
        name: "compile",
        commands: "compile",
        enabled: true,
        plugin: "elixir",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/elixir.svg",
      },
    ]);
    return;
  }

  if (await fileExists(`${src}/composer.json`)) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "composer install",
        commands: "composer_install",
        enabled: true,
        plugin: "php",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/php-plain.svg",
      },
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "php",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/php-plain.svg",
      },
    ]);
    return;
  }

  if (
    (await fileExists(`${src}/pubspec.yaml`)) &&
    (await dirExists(`${src}/android`))
  ) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "flutter",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/flutter-original.svg",
      },
      {
        id: createId(),
        name: "build",
        commands: "build",
        enabled: true,
        plugin: "flutter",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/flutter-original.svg",
      },
    ]);
    return;
  }

  if (await fileExists(`${src}/Gemfile`)) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "rubocop",
        commands: "rubocop",
        enabled: true,
        plugin: "ruby",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/ruby-original.svg",
      },
      {
        id: createId(),
        name: "tests",
        commands: "rspec",
        enabled: true,
        plugin: "ruby",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/ruby-original.svg",
      },
    ]);
    return;
  }

  if (await fileExists(`${src}/project.clj`)) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "clojure",
        useWasm: true,
        logo: "",
      },
      {
        id: createId(),
        name: "uberjar",
        commands: "uberjar",
        enabled: true,
        plugin: "clojure",
        useWasm: true,
        logo: "",
      },
    ]);
    return;
  }

  if (await fileExists(`${src}/pom.xml`)) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "maven",
        useWasm: true,
        logo: "",
      },
      {
        id: createId(),
        name: "compile",
        commands: "compile",
        enabled: true,
        plugin: "maven",
        useWasm: true,
        logo: "",
      },
    ]);
    return;
  }

  if (await fileExists(`${src}/build.sbt`)) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "sbt",
        useWasm: true,
        logo: "",
      },
      {
        id: createId(),
        name: "compile",
        commands: "compile",
        enabled: true,
        plugin: "sbt",
        useWasm: true,
        logo: "",
      },
    ]);

    return;
  }

  await actions.save(project.id, [
    {
      id: createId(),
      name: "hello",
      commands: "hello",
      enabled: true,
      plugin: "base",
      useWasm: true,
      logo: "",
    },
  ]);
}
