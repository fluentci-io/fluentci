import * as projects from "./server/kv/projects.ts";
import * as actions from "./server/kv/actions.ts";
import { createId } from "../deps.ts";

export async function fileExists(path: string): Promise<boolean> {
  try {
    const { isFile } = await Deno.stat(path);
    return isFile;
  } catch (_) {
    return false;
  }
}

export async function dirExists(path: string): Promise<boolean> {
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
        githubUrl: "https://github.com/fluent-ci-templates/zig-pipeline",
      },
      {
        id: createId(),
        name: "build",
        commands: "build --release",
        enabled: true,
        plugin: "rust",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/rust-plain.svg",
        githubUrl: "https://github.com/fluent-ci-templates/rust-pipeline",
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
        githubUrl: "https://github.com/fluent-ci-templates/go-pipeline",
      },
      {
        id: createId(),
        name: "build",
        commands: "build",
        enabled: true,
        plugin: "go",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/go-original-wordmark.svg",
        githubUrl: "https://github.com/fluent-ci-templates/go-pipeline",
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
        githubUrl: "https://github.com/fluent-ci-templates/bun-pipeline",
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
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/nodejs.svg",
        githubUrl: "https://github.com/fluent-ci-templates/nodejs-pipeline",
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
        githubUrl: "https://github.com/fluent-ci-templates/deno-pipeline",
      },
      {
        id: createId(),
        name: "lint",
        commands: "lint",
        enabled: true,
        plugin: "deno",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/deno.svg",
        githubUrl: "https://github.com/fluent-ci-templates/deno-pipeline",
      },
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "deno",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/deno.svg",
        githubUrl: "https://github.com/fluent-ci-templates/deno-pipeline",
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
        githubUrl: "https://github.com/fluent-ci-templates/gleam-pipeline",
      },
      {
        id: createId(),
        name: "build",
        commands: "build",
        enabled: true,
        plugin: "gleam",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/gleam.png",
        githubUrl: "https://github.com/fluent-ci-templates/gleam-pipeline",
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
        githubUrl: "https://github.com/fluent-ci-templates/zig-pipeline",
      },
      {
        id: createId(),
        name: "build",
        commands: "build",
        enabled: true,
        plugin: "zig",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/zig-original.svg",
        githubUrl: "https://github.com/fluent-ci-templates/zig-pipeline",
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
        githubUrl: "https://github.com/fluent-ci-templates/elixir-pipeline",
      },
      {
        id: createId(),
        name: "compile",
        commands: "compile",
        enabled: true,
        plugin: "elixir",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/elixir.svg",
        githubUrl: "https://github.com/fluent-ci-templates/elixir-pipeline",
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
        githubUrl: "https://github.com/fluent-ci-templates/php-pipeline",
      },
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "php",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/php-plain.svg",
        githubUrl: "https://github.com/fluent-ci-templates/php-pipeline",
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
        githubUrl: "https://github.com/fluent-ci-templates/flutter-pipeline",
      },
      {
        id: createId(),
        name: "build",
        commands: "build",
        enabled: true,
        plugin: "flutter",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/flutter-original.svg",
        githubUrl: "https://github.com/fluent-ci-templates/flutter-pipeline",
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
        githubUrl: "https://github.com/fluent-ci-templates/ruby-pipeline",
      },
      {
        id: createId(),
        name: "tests",
        commands: "rspec",
        enabled: true,
        plugin: "ruby",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/ruby-original.svg",
        githubUrl: "https://github.com/fluent-ci-templates/ruby-pipeline",
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
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/clojure.svg",
        githubUrl: "https://github.com/fluent-ci-templates/clojure-pipeline",
      },
      {
        id: createId(),
        name: "uberjar",
        commands: "uberjar",
        enabled: true,
        plugin: "clojure",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/clojure.svg",
        githubUrl: "https://github.com/fluent-ci-templates/clojure-pipeline",
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
        githubUrl: "https://github.com/fluentci-io/maven-plugin",
      },
      {
        id: createId(),
        name: "compile",
        commands: "compile",
        enabled: true,
        plugin: "maven",
        useWasm: true,
        githubUrl: "https://github.com/fluentci-io/maven-plugin",
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
        githubUrl: "https://github.com/fluentci-io/sbt-plugin",
      },
      {
        id: createId(),
        name: "compile",
        commands: "compile",
        enabled: true,
        plugin: "sbt",
        useWasm: true,
        githubUrl: "https://github.com/fluentci-io/sbt-plugin",
      },
    ]);

    return;
  }

  if (await fileExists(`${src}/Package.swift`)) {
    await actions.save(project.id, [
      {
        id: createId(),
        name: "tests",
        commands: "test",
        enabled: true,
        plugin: "swift",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/swift.svg",
        githubUrl: "https://github.com/fluent-ci-templates/swift-pipeline",
      },
      {
        id: createId(),
        name: "build",
        commands: "build",
        enabled: true,
        plugin: "swift",
        useWasm: true,
        logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/swift.svg",
        githubUrl: "https://github.com/fluent-ci-templates/swift-pipeline",
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
      githubUrl: "https://github.com/fluent-ci-templates/base-pipeline",
    },
  ]);
}

export async function detectProjectType(src: string): Promise<string> {
  if (await fileExists(`${src}/Cargo.toml`)) {
    return "rust";
  }

  if (await fileExists(`${src}/go.mod`)) {
    return "go";
  }

  if (
    (await fileExists(`${src}/package.json`)) &&
    (await fileExists(`${src}/bun.lockb`))
  ) {
    return "bun";
  }

  if (await fileExists(`${src}/package.json`)) {
    return "node";
  }

  if (
    (await fileExists(`${src}/deno.json`)) ||
    (await fileExists(`${src}/deno.jsonc`))
  ) {
    return "deno";
  }

  if (await fileExists(`${src}/gleam.toml`)) {
    return "gleam";
  }

  if (await fileExists(`${src}/build.zig`)) {
    return "zig";
  }

  if (await fileExists(`${src}/mix.exs`)) {
    return "elixir";
  }

  if (await fileExists(`${src}/composer.json`)) {
    return "php";
  }

  if (
    (await fileExists(`${src}/pubspec.yaml`)) &&
    (await dirExists(`${src}/android`))
  ) {
    return "flutter";
  }

  if (await fileExists(`${src}/Gemfile`)) {
    return "ruby";
  }

  if (await fileExists(`${src}/project.clj`)) {
    return "clojure";
  }

  if (await fileExists(`${src}/pom.xml`)) {
    return "maven";
  }

  if (await fileExists(`${src}/build.sbt`)) {
    return "sbt";
  }

  if (await fileExists(`${src}/Package.swift`)) {
    return "swift";
  }

  return "base";
}
