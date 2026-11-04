//! Infer initial project actions when no explicit FluentCI configuration exists.

use crate::{config::Config, models::Action};
use anyhow::{Result, ensure};
use std::path::Path;

struct Recipe {
    plugin: &'static str,
    jobs: &'static [(&'static str, &'static str)],
    logo: Option<&'static str>,
    repository: &'static str,
}

pub fn actions(root: &Path) -> Result<Vec<Action>> {
    ensure!(
        root.is_dir(),
        "Project directory {} does not exist",
        root.display()
    );
    if let Some(path) = crate::config::find(root) {
        return Config::read(&path)?.actions();
    }
    Ok(default_actions(root))
}

pub fn default_actions(root: &Path) -> Vec<Action> {
    let kind = project_type(root);
    let recipe = match kind {
        "rust" => Recipe {
            plugin: "rust",
            jobs: &[("tests", "test --release"), ("build", "build --release")],
            logo: Some(
                "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/rust-plain.svg",
            ),
            repository: "https://github.com/fluent-ci-templates/rust-pipeline",
        },
        "go" => Recipe {
            plugin: "go",
            jobs: &[("tests", "test"), ("build", "build")],
            logo: Some(
                "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/go-original-wordmark.svg",
            ),
            repository: "https://github.com/fluent-ci-templates/go-pipeline",
        },
        "purescript" => Recipe {
            plugin: "purescript",
            jobs: &[("tests", "test"), ("build", "build")],
            logo: Some("https://upload.wikimedia.org/wikipedia/commons/6/64/PureScript_Logo.png"),
            repository: "https://github.com/fluentci-io/purescript-plugin",
        },
        "bun" => Recipe {
            plugin: "bun",
            jobs: &[("tests", "test")],
            logo: Some("https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/bun.svg"),
            repository: "https://github.com/fluent-ci-templates/bun-pipeline",
        },
        "node" => Recipe {
            plugin: "bun",
            jobs: &[("tests", "run test")],
            logo: Some("https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/nodejs.svg"),
            repository: "https://github.com/fluent-ci-templates/nodejs-pipeline",
        },
        "deno" => Recipe {
            plugin: "deno",
            jobs: &[("fmt", "fmt"), ("lint", "lint"), ("tests", "test")],
            logo: Some("https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/deno.svg"),
            repository: "https://github.com/fluent-ci-templates/deno-pipeline",
        },
        "gleam" => Recipe {
            plugin: "gleam",
            jobs: &[("tests", "test"), ("build", "build")],
            logo: Some("https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/gleam.png"),
            repository: "https://github.com/fluent-ci-templates/gleam-pipeline",
        },
        "zig" => Recipe {
            plugin: "zig",
            jobs: &[("tests", "test"), ("build", "build")],
            logo: Some(
                "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/zig-original.svg",
            ),
            repository: "https://github.com/fluent-ci-templates/zig-pipeline",
        },
        "elixir" => Recipe {
            plugin: "elixir",
            jobs: &[("tests", "test"), ("compile", "compile")],
            logo: Some("https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/elixir.svg"),
            repository: "https://github.com/fluent-ci-templates/elixir-pipeline",
        },
        "php" => Recipe {
            plugin: "php",
            jobs: &[("composer install", "composer_install"), ("tests", "test")],
            logo: Some(
                "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/php-plain.svg",
            ),
            repository: "https://github.com/fluent-ci-templates/php-pipeline",
        },
        "flutter" => Recipe {
            plugin: "flutter",
            jobs: &[("tests", "test"), ("build", "build")],
            logo: Some(
                "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/flutter-original.svg",
            ),
            repository: "https://github.com/fluent-ci-templates/flutter-pipeline",
        },
        "ruby" => Recipe {
            plugin: "ruby",
            jobs: &[("rubocop", "rubocop"), ("tests", "rspec")],
            logo: Some(
                "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/ruby-original.svg",
            ),
            repository: "https://github.com/fluent-ci-templates/ruby-pipeline",
        },
        "clojure" => Recipe {
            plugin: "clojure",
            jobs: &[("tests", "test"), ("uberjar", "uberjar")],
            logo: Some(
                "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/clojure.svg",
            ),
            repository: "https://github.com/fluent-ci-templates/clojure-pipeline",
        },
        "maven" => Recipe {
            plugin: "maven",
            jobs: &[("tests", "test"), ("compile", "compile")],
            logo: None,
            repository: "https://github.com/fluentci-io/maven-plugin",
        },
        "sbt" => Recipe {
            plugin: "sbt",
            jobs: &[("tests", "test"), ("compile", "compile")],
            logo: None,
            repository: "https://github.com/fluentci-io/sbt-plugin",
        },
        "swift" => Recipe {
            plugin: "swift",
            jobs: &[("tests", "test"), ("build", "build")],
            logo: Some("https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/swift.svg"),
            repository: "https://github.com/fluent-ci-templates/swift-pipeline",
        },
        "haskell" => Recipe {
            plugin: "haskell",
            jobs: &[("tests", "test"), ("build", "build")],
            logo: Some("https://upload.wikimedia.org/wikipedia/commons/1/1c/Haskell-Logo.svg"),
            repository: "https://github.com/fluentci-io/haskell-plugin",
        },
        _ => Recipe {
            plugin: "base",
            jobs: &[("hello", "hello")],
            logo: None,
            repository: "https://github.com/fluent-ci-templates/base-pipeline",
        },
    };
    recipe
        .jobs
        .iter()
        .map(|(name, command)| Action {
            name: (*name).into(),
            commands: (*command).into(),
            enabled: true,
            plugin: recipe.plugin.into(),
            use_wasm: true,
            logo: recipe.logo.map(Into::into),
            github_url: Some(recipe.repository.into()),
            ..Action::default()
        })
        .collect()
}

pub fn project_type(root: &Path) -> &'static str {
    if ["Cargo.toml"].iter().any(|file| root.join(file).is_file()) {
        return "rust";
    }
    if ["go.mod"].iter().any(|file| root.join(file).is_file()) {
        return "go";
    }
    if ["spago.yaml", "spago.dhall"]
        .iter()
        .any(|file| root.join(file).is_file())
    {
        return "purescript";
    }
    if root.join("package.json").is_file()
        && ["bun.lock", "bun.lockb"]
            .iter()
            .any(|file| root.join(file).is_file())
    {
        return "bun";
    }
    if ["package.json"]
        .iter()
        .any(|file| root.join(file).is_file())
    {
        return "node";
    }
    if ["deno.json", "deno.jsonc"]
        .iter()
        .any(|file| root.join(file).is_file())
    {
        return "deno";
    }
    if ["gleam.toml"].iter().any(|file| root.join(file).is_file()) {
        return "gleam";
    }
    if ["build.zig"].iter().any(|file| root.join(file).is_file()) {
        return "zig";
    }
    if ["mix.exs"].iter().any(|file| root.join(file).is_file()) {
        return "elixir";
    }
    if ["composer.json"]
        .iter()
        .any(|file| root.join(file).is_file())
    {
        return "php";
    }
    if ["pubspec.yaml"]
        .iter()
        .any(|file| root.join(file).is_file())
        && root.join("android").is_dir()
    {
        return "flutter";
    }
    if ["Gemfile"].iter().any(|file| root.join(file).is_file()) {
        return "ruby";
    }
    if ["project.clj"].iter().any(|file| root.join(file).is_file()) {
        return "clojure";
    }
    if ["pom.xml"].iter().any(|file| root.join(file).is_file()) {
        return "maven";
    }
    if ["build.sbt"].iter().any(|file| root.join(file).is_file()) {
        return "sbt";
    }
    if ["Package.swift"]
        .iter()
        .any(|file| root.join(file).is_file())
    {
        return "swift";
    }
    if ["cabal.project"]
        .iter()
        .any(|file| root.join(file).is_file())
    {
        return "haskell";
    }
    "base"
}
