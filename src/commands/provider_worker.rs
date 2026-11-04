use anyhow::Result;
use std::path::Path;

pub(super) fn execute(request: &Path) -> Result<()> {
    fluentci_ext::worker::run(request)
}
