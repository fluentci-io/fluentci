use crate::{cli::ModuleCommand, config::ModuleRuntime, modules};
use anyhow::Result;

fn added_runtime(runtime: Option<ModuleRuntime>, existing: bool) -> ModuleRuntime {
    runtime.unwrap_or(if existing {
        // An unspecified legacy runtime permits binary detection of either ABI
        // and preserves existing source build settings.
        ModuleRuntime::Extism
    } else {
        ModuleRuntime::Component
    })
}

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
            let runtime = added_runtime(runtime, path.is_some() || url.is_some());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registration_keeps_detection_and_creation_defaults_to_components() {
        assert_eq!(added_runtime(None, false), ModuleRuntime::Component);
        assert_eq!(added_runtime(None, true), ModuleRuntime::Extism);
        for existing in [false, true] {
            for runtime in [ModuleRuntime::Component, ModuleRuntime::Extism] {
                assert_eq!(added_runtime(Some(runtime), existing), runtime);
            }
        }
    }
}
