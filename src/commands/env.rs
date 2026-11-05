use crate::{config, workspace::Workspace};
use anyhow::Result;

pub(super) fn execute() -> Result<()> {
    for (key, value) in config::environment(&Workspace::current()?.root)? {
        println!("{key} = {value}");
    }
    Ok(())
}
