use anyhow::Result;
use tokio::process::Command;

pub(super) async fn execute() -> Result<()> {
    println!(
        "FluentCI {} (embedded engine, Studio, SQLite)",
        env!("CARGO_PKG_VERSION")
    );
    let mut missing = Vec::new();
    for (name, args) in [
        ("deno", vec!["--version"]),
        ("dagger", vec!["version"]),
        ("docker", vec!["--version"]),
        ("glow", vec!["--version"]),
    ] {
        match Command::new(name).args(args).output().await {
            Ok(output) if output.status.success() => println!(
                "[✓] {name}: {}",
                String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .next()
                    .unwrap_or_default()
            ),
            _ => {
                println!("[✗] {name}: not available");
                missing.push(name);
            }
        }
    }
    anyhow::ensure!(
        missing.is_empty(),
        "Missing optional pipeline tools: {}",
        missing.join(", ")
    );
    Ok(())
}
