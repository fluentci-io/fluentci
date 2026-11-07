use std::{
    env::consts::{ARCH, OS},
    fs,
    process::{Command, Stdio},
    sync::{mpsc, Arc, Mutex},
};

use anyhow::{Context, Error};
use extism::{Manifest, PluginBuilder, UserData, Wasm};
use fluentci_core::deps::Graph;
use fluentci_ext::{pkgx::Pkgx, runner::Runner, Extension};
use fluentci_shared::state::State;

fn load(module: &str) -> Result<Wasm, Error> {
    let wasm = match module.starts_with("http")
        || module.starts_with("azurecr.io/")
        || module.starts_with("ghcr.io/")
        || module.starts_with("gcr.io/")
    {
        true => download_module(module)?,
        false => Wasm::file(module),
    };

    match wasm {
        Wasm::File { path, .. } => Ok(Wasm::data(fs::read(path)?)),
        other => Ok(other),
    }
}

fn metadata(wasm: &Wasm, function: &str) -> Result<super::metadata::Function, Error> {
    let bytes = match wasm {
        Wasm::Data { data, .. } => data.as_slice(),
        _ => {
            return Err(anyhow::anyhow!(
                "Module metadata requires a downloaded artifact"
            ))
        }
    };
    super::metadata::inspect(bytes, None)?
        .into_iter()
        .find(|metadata| metadata.name == function)
        .with_context(|| format!("Function {function:?} not found in module"))
}

pub fn call_argv(module: &str, function: &str, arguments: &[String]) -> Result<(), Error> {
    let wasm = load(module)?;
    if let Wasm::Data { data, .. } = &wasm {
        if fluentci_components::is_component(data) {
            return execute_component(data, function, arguments);
        }
    }
    let metadata = metadata(&wasm, function)?;
    let input = super::arguments::encode(&metadata, arguments)?;
    execute(wasm, function, &input)
}

pub fn call(module: &str, command: &str) -> Result<(), Error> {
    let (function, input) = command.split_once(' ').unwrap_or((command, ""));
    let wasm = load(module)?;
    if let Wasm::Data { data, .. } = &wasm {
        if fluentci_components::is_component(data) {
            let words = shlex::split(input).context("Unclosed quote in component arguments")?;
            return execute_component(data, function, &words);
        }
    }
    let metadata = metadata(&wasm, function)?;
    let input = if metadata.input_format == super::metadata::InputFormat::Json {
        let arguments = shlex::split(input).context("Unclosed quote in module arguments")?;
        super::arguments::encode(&metadata, &arguments)?
    } else {
        input.to_owned()
    };
    execute(wasm, function, &input)
}

fn execute_component(bytes: &[u8], function: &str, words: &[String]) -> Result<(), Error> {
    let cancellation = fluentci_executor::Cancellation::default();
    let _signals = fluentci_core::signals::CancellationSignals::new(cancellation.clone())?;
    let _ = fluentci_core::init_tracer();
    let _ = fluentci_core::set_git_repo_metadata();
    let context = fluentci_shared::state::State::new(cancellation.clone());
    context.lock().unwrap().caller = Some(fluentci_shared::module_call::invoke);
    let result =
        fluentci_components::call_with_context(bytes, function, words, cancellation, context);
    fluentci_core::shutdown_tracer();
    let result = result?;
    if !result.is_empty() {
        println!("{result}");
    }
    Ok(())
}

fn execute(wasm: Wasm, func: &str, args: &str) -> Result<(), Error> {
    match fluentci_core::init_tracer() {
        Ok(_) => {}
        Err(e) => {
            println!("{}", e);
        }
    }
    match fluentci_core::set_git_repo_metadata() {
        Ok(_) => {}
        Err(e) => {
            println!("{}", e);
        }
    }

    let (tx, rx) = mpsc::channel();
    let graph = Graph::new(tx, Arc::new(Box::new(Runner::default())));
    let cancellation = graph.cancellation.clone();
    let _signals = fluentci_core::signals::CancellationSignals::new(cancellation.clone())?;
    let execution_failure = Arc::new(Mutex::new(None));
    let user_data = UserData::new(State {
        graph: Arc::new(Mutex::new(graph)),
        rx: Arc::new(Mutex::new(rx)),
        runner: "default".into(),
        execution_failure: execution_failure.clone(),
        caller: Some(fluentci_shared::module_call::invoke),
        call_depth: 0,
    });

    let manifest = Manifest::new([wasm]);
    let mut plugin =
        fluentci_shared::host::register(PluginBuilder::new(manifest).with_wasi(true), user_data)
            .build()?;

    let response = plugin
        .call::<&str, &str>(func, args)
        .map(str::to_owned)
        .with_context(|| format!("Wasm export {func:?} failed"));
    fluentci_core::shutdown_tracer();
    let response = match response {
        Ok(value) => value,
        Err(error) => {
            if let Some(failure) = execution_failure.lock().unwrap().clone() {
                return Err(Error::new(failure).context(format!("{error:#}")));
            }
            return Err(error);
        }
    };
    if cancellation.is_cancelled() {
        return Err(anyhow::anyhow!("plugin execution was cancelled"));
    }
    println!("{}", response);
    Ok(())
}

pub fn download_module(url: &str) -> Result<Wasm, Error> {
    let filename = format!("{}.wasm", sha256::digest(url));
    let work_dir = format!("{}/.fluentci/cache", std::env::var("HOME").unwrap());

    if fs::metadata(format!("{}/{}", work_dir, filename)).is_ok() {
        return Ok(Wasm::file(format!("{}/{}", work_dir, filename)));
    }

    if url.starts_with("azurecr.io/") || url.starts_with("ghcr.io/") || url.starts_with("gcr.io/") {
        Pkgx::default().setup()?;
        fs::create_dir_all(&work_dir)?;
        setup_wasm_to_oci()?;

        let mut child = Command::new("bash")
            .arg("-c")
            .arg(format!("wasm-to-oci pull {} --out {}", url, filename))
            .current_dir(&work_dir)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()?;

        child.wait()?;

        return Ok(Wasm::file(format!("{}/{}", work_dir, filename)));
    }

    fs::create_dir_all(&work_dir)?;
    fluentci_ext::bootstrap::download(url, &std::path::Path::new(&work_dir).join(&filename))?;

    Ok(Wasm::file(format!("{}/{}", work_dir, filename)))
}

pub fn setup_wasm_to_oci() -> Result<(), Error> {
    let os = match OS {
        "macos" => "darwin",
        _ => OS,
    };
    let arch = match ARCH {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        _ => ARCH,
    };

    std::env::set_var("OS", os);
    std::env::set_var("ARCH", arch);

    let path = std::env::var("PATH").unwrap();
    let home = std::env::var("HOME").unwrap();
    let path = format!("{}/.local/bin:{}", home, path);
    std::env::set_var("PATH", path);

    fs::create_dir_all(format!("{}/.local/bin", home))?;

    let mut child = Command::new("bash")
        .arg("-c")
        .arg("type wasm-to-oci > /dev/null 2> /dev/null || pkgx wget@1.21.4 https://github.com/fluentci-io/wasm-to-oci/releases/download/v0.1.2/wasm-to-oci_${OS}-${ARCH}.tar.gz ; \
            type wasm-to-oci > /dev/null 2> /dev/null || pkgx tar xvf wasm-to-oci_${OS}-${ARCH}.tar.gz ; \
            type wasm-to-oci > /dev/null 2> /dev/null || cp wasm-to-oci ${HOME}/.local/bin ; \
            [ -f wasm-to-oci ] && rm wasm-to-oci || true ; \
            [ -f wasm-to-oci_${OS}-${ARCH}.tar.gz ] && rm wasm-to-oci_${OS}-${ARCH}.tar.gz || true \
        ")
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()?;

    child.wait()?;

    Ok(())
}
