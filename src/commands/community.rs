use anyhow::Result;

pub(super) fn execute() -> Result<()> {
    open::that("https://discord.gg/V4U6dPskKc")?;
    Ok(())
}
