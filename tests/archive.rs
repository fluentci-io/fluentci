use fluentci::archive;
#[test]
fn bundles_are_deterministic_and_honor_ignore_files() -> anyhow::Result<()> {
    let root = tempfile::tempdir()?;
    std::fs::write(root.path().join("source.txt"), "content")?;
    std::fs::write(root.path().join(".fluentciignore"), "secret.txt\n")?;
    std::fs::write(root.path().join("secret.txt"), "must not be included")?;
    let one = archive::bundle(root.path())?;
    let two = archive::bundle(root.path())?;
    assert_eq!(one, two);
    let output = tempfile::tempdir()?;
    archive::extract(&one, output.path())?;
    assert!(output.path().join("source.txt").is_file());
    assert!(!output.path().join("secret.txt").exists());
    Ok(())
}
#[test]
fn refuses_archive_paths_outside_destination() -> anyhow::Result<()> {
    use std::io::{Cursor, Write};
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    zip.start_file("../outside.txt", zip::write::SimpleFileOptions::default())?;
    zip.write_all(b"invalid")?;
    let bytes = zip.finish()?.into_inner();
    let output = tempfile::tempdir()?;
    assert!(archive::extract(&bytes, output.path()).is_err());
    Ok(())
}
