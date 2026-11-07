//! Recursive dispatch shares the invocation context across both guest runtimes.
use anyhow::{Context as _, Result};
use extism::{Manifest, PluginBuilder, UserData, Wasm};
use fluentci_common::host::Context;
use fluentci_types::Module;

pub fn invoke(context: &Context, module: Module) -> Result<String> {
    let bytes = if module.url.starts_with("https://") || module.url.starts_with("http://") {
        let file = tempfile::NamedTempFile::new()?;
        fluentci_ext::bootstrap::download(&module.url, file.path())?;
        std::fs::read(file.path())?
    } else {
        std::fs::read(&module.url)
            .with_context(|| format!("Reading nested module {}", module.url))?
    };
    if fluentci_components::is_component(&bytes) {
        let words =
            shlex::split(&module.args).context("Unclosed quote in nested component arguments")?;
        let cancellation = context
            .lock()
            .unwrap()
            .graph
            .lock()
            .unwrap()
            .cancellation
            .clone();
        return fluentci_components::call_with_context(
            &bytes,
            &module.function,
            &words,
            cancellation,
            context.clone(),
        );
    }
    let user = UserData::Rust(context.clone());
    let mut plugin = crate::host::register(
        PluginBuilder::new(Manifest::new([Wasm::data(bytes)])).with_wasi(true),
        user,
    )
    .build()?;
    Ok(plugin
        .call::<&str, &str>(&module.function, &module.args)?
        .to_owned())
}
