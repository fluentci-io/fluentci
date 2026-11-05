use std::{
    io::Write,
    process::{Command, Stdio},
};

#[test]
fn native_repl_runs_modules_and_recovers_from_errors() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    std::fs::write(
        temp.path().join("plugin.wasm"),
        wat::parse_str(
            r#"(module
            (import "extism:host/env" "alloc" (func $alloc (param i64) (result i64)))
            (import "extism:host/env" "store_u8" (func $store (param i64 i32)))
            (import "extism:host/env" "output_set" (func $output (param i64 i64)))
            (func (export "hello") (result i32) (local $memory i64)
                i64.const 2 call $alloc local.set $memory
                local.get $memory i32.const 79 call $store
                local.get $memory i64.const 1 i64.add i32.const 75 call $store
                local.get $memory i64.const 2 call $output
                i32.const 0))"#,
        )?,
    )?;
    std::fs::write(
        temp.path().join("fluentci.toml"),
        "[[modules]]\nname='main'\npath='plugin.wasm'",
    )?;
    let mut process = Command::new(env!("CARGO_BIN_EXE_fluentci"))
        .args(["--check-update=false", "--database"])
        .arg(temp.path().join("db"))
        .args(["repl", "main"])
        .env_remove("FLUENTCI_PROJECT_ID")
        .current_dir(temp.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    process
        .stdin
        .take()
        .unwrap()
        .write_all(b"help\nmodules\n'unclosed\nmissing\nhello\nrun main hello\nexit\n")?;
    let output = process.wait_with_output()?;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout)?;
    let stderr = String::from_utf8(output.stderr)?;
    assert!(stdout.contains("Selected module: main"));
    assert!(stdout.contains("Commands:"));
    assert!(stdout.contains("  hello"));
    assert_eq!(
        stdout.lines().filter(|line| *line == "OK").count(),
        2,
        "{stdout}"
    );
    assert!(stderr.contains("Unclosed quote"));
    assert!(stderr.contains("missing"));
    assert!(!stderr.contains("Wasm export \"hello\" failed"));
    assert!(!stdout.contains("Deno"));
    Ok(())
}

#[test]
fn native_repl_exits_on_eof_without_an_external_runtime() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let output = Command::new(env!("CARGO_BIN_EXE_fluentci"))
        .args(["--check-update=false", "--database"])
        .arg(temp.path().join("db"))
        .arg("repl")
        .env("PATH", temp.path())
        .stdin(Stdio::null())
        .current_dir(temp.path())
        .output()?;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(())
}
