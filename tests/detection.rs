use fluentci::{
    db::Db,
    detection, executor,
    models::{Action, Project},
};

#[test]
fn detects_supported_projects_and_preserves_default_jobs() -> anyhow::Result<()> {
    for (files, directories, expected, plugin, commands) in [
        (
            vec!["Cargo.toml"],
            vec![],
            "rust",
            "rust",
            vec!["test --release", "build --release"],
        ),
        (vec!["go.mod"], vec![], "go", "go", vec!["test", "build"]),
        (
            vec!["spago.yaml"],
            vec![],
            "purescript",
            "purescript",
            vec!["test", "build"],
        ),
        (
            vec!["spago.dhall"],
            vec![],
            "purescript",
            "purescript",
            vec!["test", "build"],
        ),
        (
            vec!["package.json", "bun.lock"],
            vec![],
            "bun",
            "bun",
            vec!["test"],
        ),
        (
            vec!["package.json", "bun.lockb"],
            vec![],
            "bun",
            "bun",
            vec!["test"],
        ),
        (
            vec!["package.json"],
            vec![],
            "node",
            "bun",
            vec!["run test"],
        ),
        (
            vec!["deno.json"],
            vec![],
            "deno",
            "deno",
            vec!["fmt", "lint", "test"],
        ),
        (
            vec!["deno.jsonc"],
            vec![],
            "deno",
            "deno",
            vec!["fmt", "lint", "test"],
        ),
        (
            vec!["gleam.toml"],
            vec![],
            "gleam",
            "gleam",
            vec!["test", "build"],
        ),
        (
            vec!["build.zig"],
            vec![],
            "zig",
            "zig",
            vec!["test", "build"],
        ),
        (
            vec!["mix.exs"],
            vec![],
            "elixir",
            "elixir",
            vec!["test", "compile"],
        ),
        (
            vec!["composer.json"],
            vec![],
            "php",
            "php",
            vec!["composer_install", "test"],
        ),
        (
            vec!["pubspec.yaml"],
            vec!["android"],
            "flutter",
            "flutter",
            vec!["test", "build"],
        ),
        (
            vec!["Gemfile"],
            vec![],
            "ruby",
            "ruby",
            vec!["rubocop", "rspec"],
        ),
        (
            vec!["project.clj"],
            vec![],
            "clojure",
            "clojure",
            vec!["test", "uberjar"],
        ),
        (
            vec!["pom.xml"],
            vec![],
            "maven",
            "maven",
            vec!["test", "compile"],
        ),
        (
            vec!["build.sbt"],
            vec![],
            "sbt",
            "sbt",
            vec!["test", "compile"],
        ),
        (
            vec!["Package.swift"],
            vec![],
            "swift",
            "swift",
            vec!["test", "build"],
        ),
        (
            vec!["cabal.project"],
            vec![],
            "haskell",
            "haskell",
            vec!["test", "build"],
        ),
        (vec!["pubspec.yaml"], vec![], "base", "base", vec!["hello"]),
        (vec!["bun.lock"], vec![], "base", "base", vec!["hello"]),
        (vec![], vec![], "base", "base", vec!["hello"]),
    ] {
        let temp = tempfile::tempdir()?;
        for file in files {
            std::fs::write(temp.path().join(file), "")?;
        }
        for directory in directories {
            std::fs::create_dir(temp.path().join(directory))?;
        }
        assert_eq!(detection::project_type(temp.path()), expected);
        let actions = detection::actions(temp.path())?;
        assert!(
            actions
                .iter()
                .all(|a| a.enabled && a.use_wasm && a.plugin == plugin)
        );
        assert_eq!(
            actions
                .iter()
                .map(|a| a.commands.as_str())
                .collect::<Vec<_>>(),
            commands
        );
    }
    Ok(())
}

#[tokio::test]
async fn explicit_configuration_and_saved_actions_take_precedence() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    std::fs::write(temp.path().join("Cargo.toml"), "")?;
    std::fs::write(temp.path().join("package.json"), "{}")?;
    assert_eq!(detection::project_type(temp.path()), "rust");
    std::fs::write(
        temp.path().join("fluentci.toml"),
        "[[steps]]\nname='custom'\ncommand='echo configured'",
    )?;
    assert_eq!(detection::actions(temp.path())?[0].name, "custom");
    let db = Db::open(&temp.path().join("test.db")).await?;
    let project = Project::new(temp.path().to_string_lossy().into());
    db.save_project(&project).await?;
    let run = executor::prepare(&db, &project).await?;
    assert_eq!(run.jobs[0].name, "custom");
    db.save_actions(
        &project.id,
        &[Action {
            name: "saved".into(),
            commands: "echo saved".into(),
            plugin: "shell".into(),
            enabled: true,
            ..Action::default()
        }],
    )
    .await?;
    assert_eq!(
        executor::prepare(&db, &project).await?.jobs[0].name,
        "saved"
    );
    assert_eq!(db.actions(&project.id).await?[0].name, "saved");
    std::fs::remove_file(temp.path().join("fluentci.toml"))?;
    db.save_actions(&project.id, &[]).await?;
    let detected = executor::prepare(&db, &project).await?;
    assert_eq!(detected.jobs.len(), 2);
    // Preparation snapshots detected actions for this run without overwriting
    // the project's saved actions or materializing a workflow file.
    let snapshot = db
        .run_actions(&detected.id)
        .await?
        .expect("prepared run snapshot");
    assert_eq!(snapshot.len(), 2);
    assert_eq!(snapshot[0].commands, "test --release");
    assert!(db.actions(&project.id).await?.is_empty());
    assert!(
        !temp
            .path()
            .join(".fluentci/workflows/default.toml")
            .exists()
    );
    Ok(())
}
