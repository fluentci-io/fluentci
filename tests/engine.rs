use std::process::Command;
#[test]
fn runs_wasm_with_the_linked_engine_without_an_external_binary() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let module = temp.path().join("test.wasm");
    std::fs::write(
        &module,
        wat::parse_str("(module (func (export \"ping\") (result i32) i32.const 0))")?,
    )?;
    let output = Command::new(env!("CARGO_BIN_EXE_fluentci"))
        .args(["--check-update=false", "--database"])
        .arg(temp.path().join("db"))
        .args(["run", "--wasm"])
        .arg(&module)
        .arg("ping")
        .env_remove("FLUENTCI_PROJECT_ID")
        .current_dir(temp.path())
        .output()?;
    assert!(
        output.status.success(),
        "stdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let failure = Command::new(env!("CARGO_BIN_EXE_fluentci"))
        .args(["__engine-call", "--module"])
        .arg(&module)
        .args(["--", "missing_export"])
        .current_dir(temp.path())
        .output()?;
    assert!(!failure.status.success());
    Ok(())
}
