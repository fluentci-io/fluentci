//! Native Component Model execution, independent of the Extism ABI.

#[cfg(target_os = "openbsd")]
extern crate wasmtime_wasi_openbsd as wasmtime_wasi;

use anyhow::{bail, ensure, Context, Result};
use fluentci_executor::Cancellation;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};
use wasmtime::{
    component::{Component, Linker, ResourceTable, Val},
    Config, Engine, Store,
};
#[cfg(not(target_os = "openbsd"))]
use wasmtime_wasi::FsPerms;
#[cfg(target_os = "openbsd")]
use wasmtime_wasi::{DirPerms, FilePerms};
use wasmtime_wasi::{WasiCtx, WasiCtxView, WasiView};

pub mod composition;
mod host_api;
pub mod interface;
mod values;

pub use fluentci_common::host::State;
pub use fluentci_common::module_dependencies;
pub use interface::{Argument, Function, Surface};

/// Recognize the binary component encoding before interpreting any nested modules.
pub fn is_component(bytes: &[u8]) -> bool {
    bytes.starts_with(b"\0asm\x0d\0\x01\0")
}

struct Host {
    wasi: WasiCtx,
    table: ResourceTable,
    context: fluentci_common::host::Context,
}

impl WasiView for Host {
    fn ctx(&mut self) -> WasiCtxView<'_> {
        WasiCtxView {
            ctx: &mut self.wasi,
            table: &mut self.table,
        }
    }
}

impl Host {
    fn execute(&mut self, plan: &str, directory: &str) -> Result<String> {
        fluentci_common::host::execute_plan(&self.context,serde_json::json!({"plan":serde_json::from_str::<serde_json::Value>(plan)?,"run_dir":directory}).to_string())
    }

    fn failure(&self) -> Option<fluentci_executor::diagnostics::ExecutionFailure> {
        self.context
            .lock()
            .unwrap()
            .execution_failure
            .lock()
            .unwrap()
            .clone()
    }
}

fn nested(
    context: &fluentci_common::host::Context,
    module: fluentci_types::Module,
) -> Result<String> {
    let bytes = if module.url.starts_with("https://") || module.url.starts_with("http://") {
        let file = tempfile::NamedTempFile::new()?;
        fluentci_ext::bootstrap::download(&module.url, file.path())?;
        std::fs::read(file.path())?
    } else {
        std::fs::read(&module.url)?
    };
    ensure!(
        is_component(&bytes),
        "Nested core Wasm requires the dual-runtime host dispatcher"
    );
    let words = dependency_arguments(&module.args)?;
    let cancellation = context
        .lock()
        .unwrap()
        .graph
        .lock()
        .unwrap()
        .cancellation
        .clone();
    call_with_context(
        &bytes,
        &module.function,
        &words,
        cancellation,
        context.clone(),
    )
}

struct Interrupt {
    stop: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<()>>,
}

impl Interrupt {
    fn new(engine: Engine, cancellation: Cancellation) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let done = stop.clone();
        let worker = thread::spawn(move || {
            while !done.load(Ordering::Acquire) {
                if cancellation.is_cancelled() {
                    engine.increment_epoch();
                    break;
                }
                thread::sleep(Duration::from_millis(10));
            }
        });
        Self {
            stop,
            worker: Some(worker),
        }
    }
}

impl Drop for Interrupt {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

/// Decode a typed JSON input object or the existing CLI-style argument string.
pub fn dependency_arguments(input: &str) -> Result<Vec<String>> {
    if let Ok(serde_json::Value::Object(fields)) = serde_json::from_str(input) {
        return fields
            .into_iter()
            .map(|(name, value)| {
                ensure!(
                    !name.is_empty()
                        && name
                            .chars()
                            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'),
                    "Invalid dependency argument name"
                );
                let value = if let serde_json::Value::String(value) = value {
                    value
                } else {
                    value.to_string()
                };
                Ok(format!("--{name}={value}"))
            })
            .collect();
    }
    shlex::split(input).context("Unclosed quote in nested component arguments")
}

/// Validate typed arguments before instantiation, then call a WIT export.
pub fn call(
    bytes: &[u8],
    name: &str,
    words: &[String],
    cancellation: Cancellation,
) -> Result<String> {
    let context = fluentci_common::host::State::new(cancellation.clone());
    context.lock().unwrap().caller = Some(nested);
    call_with_context(bytes, name, words, cancellation, context)
}

pub fn call_with_context(
    bytes: &[u8],
    name: &str,
    words: &[String],
    cancellation: Cancellation,
    context: fluentci_common::host::Context,
) -> Result<String> {
    ensure!(
        !cancellation.is_cancelled(),
        "component execution was cancelled"
    );
    let surface = Surface::parse(bytes)?;
    let function = surface.find(name)?;
    let arguments = values::bind(&surface.resolve, function, words)?;
    let mut config = Config::new();
    config.wasm_component_model(true).epoch_interruption(true);
    let engine = Engine::new(&config)?;
    let component = Component::from_binary(&engine, bytes)
        .map_err(anyhow::Error::from)
        .context("Compiling Wasm component")?;
    ensure!(
        !cancellation.is_cancelled(),
        "component execution was cancelled"
    );
    let mut linker = Linker::new(&engine);
    wasmtime_wasi::p2::add_to_linker_sync(&mut linker)?;
    host_api::register(&mut linker, &surface.resolve)?;
    let mut api = linker.instance("fluentci:runtime/host@0.1.0")?;
    api.func_wrap(
        "get-env",
        |store: wasmtime::StoreContextMut<'_, Host>, (name,): (String,)| {
            Ok((store
                .data()
                .context
                .lock()
                .unwrap()
                .graph
                .lock()
                .unwrap()
                .environment
                .get(&name)
                .cloned(),))
        },
    )?;
    api.func_wrap("log", |_, (message,): (String,)| {
        println!("{message}");
        Ok(())
    })?;
    api.func_wrap(
        "execute-plan",
        |mut store: wasmtime::StoreContextMut<'_, Host>, (plan, directory): (String, String)| {
            Ok((store
                .data_mut()
                .execute(&plan, &directory)
                .map_err(|error| format!("{error:#}")),))
        },
    )?;
    let mut wasi = WasiCtx::builder();
    wasi.inherit_stdio().inherit_env();
    #[cfg(not(target_os = "openbsd"))]
    wasi.preopened_dir(std::env::current_dir()?, ".", FsPerms::ReadWrite)?;
    #[cfg(target_os = "openbsd")]
    wasi.preopened_dir(
        std::env::current_dir()?,
        ".",
        DirPerms::all(),
        FilePerms::all(),
    )?;
    let host = Host {
        wasi: wasi.build(),
        table: ResourceTable::new(),
        context,
    };
    let mut store = Store::new(&engine, host);
    store.set_epoch_deadline(1);
    let _interrupt = Interrupt::new(engine, cancellation.clone());
    let instance = match linker.instantiate(&mut store, &component) {
        Ok(instance) => instance,
        Err(error) => {
            ensure!(
                !cancellation.is_cancelled(),
                "component execution was cancelled"
            );
            return Err(anyhow::Error::from(error)).context("Instantiating Wasm component");
        }
    };
    let mut index = None;
    for segment in &function.path {
        index = Some(
            instance
                .get_export_index(&mut store, index.as_ref(), segment)
                .with_context(|| format!("Missing WIT export {segment:?}"))?,
        );
    }
    let function = instance
        .get_func(&mut store, index.as_ref().context("Missing WIT export")?)
        .context("Export is not a function")?;
    let mut results = vec![Val::Bool(false); function.ty(&store).results().len()];
    let response = function.call(&mut store, &arguments, &mut results);
    if let Err(error) = response {
        ensure!(
            !cancellation.is_cancelled(),
            "component execution was cancelled"
        );
        if let Some(failure) = store.data().failure() {
            return Err(anyhow::Error::new(failure).context(error));
        }
        return Err(anyhow::Error::from(error)).context("Calling WIT export");
    }
    // Copy lifted results before releasing the guest's canonical-ABI allocations.
    let output = values::output(&results);
    #[cfg(target_os = "openbsd")]
    function.post_return(&mut store)?;
    ensure!(
        !cancellation.is_cancelled(),
        "component execution was cancelled"
    );
    if let Some(failure) = store.data().failure() {
        bail!(failure);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    fn add() -> Result<Vec<u8>> {
        Ok(wat::parse_str(
            r#"(component
          (core module $m (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add))
          (core instance $i (instantiate $m))
          (func (export "add") (param "left" u32) (param "right" u32) (result u32)
            (canon lift (core func $i "add"))))"#,
        )?)
    }

    #[test]
    fn native_component_signatures_and_named_arguments_use_wit() -> Result<()> {
        let bytes = add()?;
        assert!(is_component(&bytes));
        let surface = Surface::parse(&bytes)?;
        let function = surface.find("add")?;
        assert_eq!(function.arguments(&surface.resolve)[0].name, "left");
        assert_eq!(function.returns(&surface.resolve), "u32");
        assert_eq!(
            call(
                &bytes,
                "add",
                &["--right".into(), "2".into(), "--left=40".into()],
                Cancellation::default()
            )?,
            "42"
        );
        assert!(call(
            &bytes,
            "add",
            &["--left=-1".into(), "--right=2".into()],
            Cancellation::default()
        )
        .is_err());
        assert!(call(
            &bytes,
            "add",
            &["--left=4294967296".into(), "--right=2".into()],
            Cancellation::default()
        )
        .is_err());
        assert!(call(
            &bytes,
            "add",
            &["--unknown=1".into()],
            Cancellation::default()
        )
        .is_err());
        Ok(())
    }

    #[test]
    fn invalid_arguments_are_rejected_before_component_initialization() -> Result<()> {
        let bytes = wat::parse_str(
            r#"(component
          (core module $m (func $start unreachable) (start $start)
            (func (export "build") (param i32)))
          (core instance $i (instantiate $m))
          (func (export "build") (param "count" u32) (canon lift (core func $i "build"))))"#,
        )?;
        let error = call(&bytes, "build", &[], Cancellation::default()).unwrap_err();
        assert!(
            error
                .to_string()
                .contains("Missing required argument --count"),
            "{error:#}"
        );
        Ok(())
    }

    #[test]
    fn cancellation_interrupts_a_busy_component() -> Result<()> {
        let bytes = wat::parse_str(
            r#"(component
          (core module $m (func (export "spin") (loop br 0)))
          (core instance $i (instantiate $m))
          (func (export "spin") (canon lift (core func $i "spin"))))"#,
        )?;
        let cancellation = Cancellation::default();
        let signal = cancellation.clone();
        let worker = thread::spawn(move || {
            thread::sleep(Duration::from_millis(50));
            signal.cancel();
        });
        let result = call(&bytes, "spin", &[], cancellation);
        worker.join().unwrap();
        assert!(result.unwrap_err().to_string().contains("cancelled"));
        Ok(())
    }
}

#[cfg(test)]
mod sdk_parity_tests {
    use super::*;

    #[test]
    #[ignore = "requires a compiled SDK component in FLUENTCI_COMPONENT_FIXTURE"]
    fn sdk_component_uses_native_capabilities() -> Result<()> {
        let path = std::env::var("FLUENTCI_COMPONENT_FIXTURE")?;
        let bytes = std::fs::read(path)?;
        let result = call(&bytes, "parity", &[], Cancellation::default())?;
        assert!(result.contains("capability-parity"), "{result}");
        Ok(())
    }
}
