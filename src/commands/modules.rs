use crate::{cli::ModuleCommand, modules};
use anyhow::Result;

pub(super) async fn execute(
    command: Option<ModuleCommand>,
    name: Option<&str>,
    json: bool,
) -> Result<()> {
    match command {
        Some(ModuleCommand::Embed {
            artifact,
            manifest,
            output,
        }) => {
            let bytes = tokio::fs::read(&artifact).await?;
            let functions = crate::plugin_metadata::read_manifest(&manifest, &bytes)?;
            let annotated = crate::plugin_metadata::embed(&bytes, functions)?;
            let path = output.as_ref().unwrap_or(&artifact);
            let directory = path
                .parent()
                .filter(|path| !path.as_os_str().is_empty())
                .unwrap_or(std::path::Path::new("."));
            let mut file = tempfile::NamedTempFile::new_in(directory)?;
            std::io::Write::write_all(&mut file, &annotated)?;
            file.persist(path)?;
            println!("{}", path.display());
            Ok(())
        }
        Some(ModuleCommand::Add {
            name,
            sdk,
            runtime,
            path,
            url,
            entry,
        }) => {
            modules::add(
                &name,
                sdk,
                path.as_deref(),
                url.as_deref(),
                entry.as_deref(),
                runtime,
            )
            .await
        }
        None => modules::inspect(name, json).await,
    }
}
