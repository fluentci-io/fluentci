use crate::config::{ModuleRuntime, Sdk};
use clap::{
    Args, Parser, Subcommand,
    builder::{Styles, styling::RgbColor},
};
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(
    name = "fluentci",
    version,
    about = "FluentCI — CI/CD pipelines powered by Wasm",
    disable_help_flag = true,
    defer(configure_run_help),
    subcommand_precedence_over_arg = true,
    styles = help_styles()
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
    #[command(flatten)]
    pub run: RunArgs,
    /// SQLite database path
    #[arg(long, global=true, env="FLUENTCI_DATABASE", default_value_os_t=default_database())]
    pub database: PathBuf,
    /// Check for a published CLI update at most once a day
    #[arg(long, global=true, default_value="true", action=clap::ArgAction::Set)]
    pub check_update: bool,
}

fn configure_run_help(command: clap::Command) -> clap::Command {
    // Clap propagates disable_help_flag to children. Reset it after propagation
    // for commands that do not use RunArgs' metadata-aware help flag.
    command.mut_subcommands(|child| {
        if child.get_name() == "run" {
            child
        } else {
            child.defer(|command| command.disable_help_flag(false))
        }
    })
}

/// Rocksky's palette, mapped to Clap's help and diagnostic roles.
fn help_styles() -> Styles {
    let primary = RgbColor(0, 232, 198).on_default();
    let secondary = RgbColor(0, 198, 232).on_default();
    let accent = RgbColor(130, 100, 255).on_default();
    let highlight = RgbColor(100, 232, 130).on_default();
    let muted = RgbColor(200, 210, 220).on_default();
    let error = RgbColor(255, 100, 100).on_default();

    Styles::styled()
        .header(primary.bold())
        .usage(secondary.bold())
        .literal(highlight)
        .placeholder(accent)
        .context(muted)
        .context_value(secondary)
        .valid(highlight)
        .invalid(error)
        .error(error.bold())
}

fn default_database() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".fluentci/fluentci.db")
}

#[derive(Debug, Clone, Default, Args)]
pub struct RunArgs {
    /// Show CLI help, or module/function metadata when a module is selected
    #[arg(short = 'h', long = "help")]
    pub help: bool,
    /// Run a named workflow from .fluentci/workflows (defaults to the project workflow)
    #[arg(long, conflicts_with = "wasm")]
    pub workflow: Option<String>,
    /// Require registry dependencies to match fluentci.lock without changing it
    #[arg(long)]
    pub frozen_lockfile: bool,
    /// Reload cached TypeScript pipeline sources
    #[arg(short = 'r', long)]
    pub reload: bool,
    /// Execute the pipeline as a WebAssembly plugin
    #[arg(short = 'w', long)]
    pub wasm: bool,
    /// Working directory for the pipeline
    #[arg(long)]
    pub work_dir: Option<PathBuf>,
    /// Declared module, local pipeline, module path, or registry package (defaults to .)
    pub pipeline: Option<String>,
    /// Job names or plugin arguments, including plugin flags
    #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
    pub jobs: Vec<String>,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Execute a native DAG plan with content caching and optional Git-affected selection
    Execute(ExecuteArgs),
    /// Add a dependency to fluentci-module.toml and install it
    Add(AddArgs),
    /// Resolve registry modules, download Wasm, and generate fluentci.lock
    Install {
        /// Reject missing or changed dependency locks
        #[arg(long)]
        frozen_lockfile: bool,
    },
    /// Refresh locked registry modules to their requested versions
    Update {
        /// Declared module alias or package reference (defaults to all)
        module: Option<String>,
    },
    /// List all workflows in the current project
    Workflows {
        /// Show only this workflow ID (defaults to all workflows)
        workflow: Option<String>,
        /// Emit workflow metadata as JSON
        #[arg(long)]
        json: bool,
        /// Show detailed steps grouped under each workflow
        #[arg(long)]
        steps: bool,
    },
    /// Run a local or registry pipeline
    #[command(disable_help_flag = true)]
    Run(RunArgs),
    /// Create a root fluentci.toml and a default module under .fluentci
    Init {
        /// Name for the generated pipeline or plugin
        name: Option<String>,
        /// Registry template to copy, optionally pinned with @version
        #[arg(short, long)]
        template: Option<String>,
        /// Generate a reusable package in the current directory
        #[arg(short, long)]
        standalone: bool,
        /// Generate a WebAssembly plugin (the default)
        #[arg(short = 'w', long)]
        wasm: bool,
        /// SDK used by the generated module
        #[arg(long, value_enum, default_value = "rust")]
        sdk: Sdk,
        /// Wasm ABI used by the generated module
        #[arg(long, value_enum, default_value = "component")]
        runtime: ModuleRuntime,
    },
    /// Search for reusable pipelines in the registry
    Search {
        /// Search terms
        query: String,
        /// Maximum number of results
        #[arg(short, long, default_value_t = 100)]
        limit: u32,
    },
    /// Discover modules and functions, or add a module
    #[command(visible_alias = "inspect", subcommand_precedence_over_arg = true)]
    Modules {
        #[command(subcommand)]
        command: Option<ModuleCommand>,
        /// Inspect only this module (builds source modules)
        name: Option<String>,
        /// Emit module paths, SDKs, and function exports as JSON
        #[arg(long)]
        json: bool,
    },
    /// List jobs in a local or registry pipeline
    #[command(name = "ls", alias = "list")]
    Ls {
        /// Pipeline to inspect (defaults to .)
        pipeline: Option<String>,
    },
    /// Render pipeline documentation with Glow
    #[command(alias = "man")]
    Docs {
        /// Pipeline whose documentation to show (defaults to .)
        pipeline: Option<String>,
    },
    /// Check the external tools used by pipelines
    Doctor,
    /// Show environment variables from .fluentci/.env
    Env,
    /// Authenticate with FLUENTCI_ACCOUNT and FLUENTCI_APP_PASSWORD and show account information
    #[command(
        long_about = "Authenticate using an AT Protocol app password and show the account handle and DID. Set FLUENTCI_ACCOUNT to a handle or DID and FLUENTCI_APP_PASSWORD to an app password. Identity is remembered in ~/.fluentci/account.json; credentials are never saved. Tangled repositories sync in the background for Studio suggestions."
    )]
    Whoami,
    /// Install the latest published CLI release
    Upgrade,
    /// Publish a Wasm plugin to your AT Protocol PDS
    #[command(
        long_about = "Publish using FLUENTCI_ACCOUNT (handle or DID) and FLUENTCI_APP_PASSWORD. Builds the selected local module, uploads to S3 via the registry, then creates io.fluentci.plugin in your PDS. Use --url to skip upload: the public URL must end in .wasm and return HTTP 200. Run fluentci publish at a module root to build and publish using fluentci-module.toml, without --wasm or --module. Otherwise metadata comes from the selected [[modules]] entry in fluentci.toml. Override metadata with --name, --version, --description, --license, --topic, --os, --arch, and --readme-url. Optional topics, OS, and CPU architectures support comma-separated values and prompt autocomplete; Enter skips optional fields. File and URL publishing prompts for missing metadata in interactive terminals; scripts must supply required fields. Identity is remembered in ~/.fluentci/account.json; passwords are never saved."
    )]
    Publish {
        /// Build and publish a WebAssembly plugin
        #[arg(short = 'w', long)]
        wasm: bool,
        /// Public .wasm URL; validate and publish without uploading
        #[arg(long, value_name = "URL", conflicts_with = "file")]
        url: Option<String>,
        /// Existing Wasm artifact to upload without building
        #[arg(long, value_name = "WASM")]
        file: Option<PathBuf>,
        /// Published package metadata
        #[command(flatten)]
        metadata: Box<crate::publishing::MetadataOptions>,
        /// Workspace module to publish or use for artifact metadata
        #[arg(long)]
        module: Option<String>,
    },
    /// Sync Tangled repositories in a detached background worker
    #[command(name = "__index-tangled", hide = true)]
    IndexTangled {
        #[arg(long)]
        account_file: PathBuf,
        #[arg(long)]
        did: String,
    },
    /// Start a hosted runner agent or list registered agents
    Agent {
        #[command(subcommand)]
        command: Option<AgentCommand>,
    },
    /// Start an interactive pipeline and Wasm module session
    Repl {
        /// Show detailed session errors
        #[arg(long)]
        debug: bool,
        /// Pipeline or module selected for direct function calls
        pipeline: Option<String>,
    },
    /// Start the embedded Studio web UI and local API
    Studio {
        /// Port for Studio and the GraphQL API
        #[arg(long, default_value_t = 6076)]
        port: u16,
    },
    /// Start the local GraphQL API and live event server
    Server {
        /// Port for the GraphQL API and live events
        #[arg(long, default_value_t = 6076)]
        port: u16,
    },
    /// Create, inspect, and export saved projects
    Project {
        #[command(subcommand)]
        command: ProjectCommand,
    },
    /// Programmatic service definitions, scoped CI commands, and JSON status
    Services {
        #[command(subcommand)]
        command: ServiceCommand,
    },
    /// Read or follow service stdout and stderr
    Logs {
        /// Service name
        service: String,
        /// Follow live output
        #[arg(short, long)]
        follow: bool,
        /// Number of recent lines to display
        #[arg(long, default_value_t = 200)]
        tail: usize,
    },
    #[command(name = "__service-manager", hide = true)]
    ServiceManager {
        #[arg(long)]
        root: PathBuf,
    },
    /// Start all services declared in TOML or Procfiles
    Up,
    /// Stop workspace services and the built-in manager
    Down,
    /// List services and their process status
    Ps,
    /// Show the status of a service
    Status {
        /// Service name from TOML, Procfile, or code
        service: String,
    },
    /// Start or restart a service
    Start {
        /// Service name from TOML, Procfile, or code
        service: String,
    },
    /// Restart a service
    Restart {
        /// Service name from TOML, Procfile, or code
        service: String,
    },
    /// Stop a service
    Stop {
        /// Service name from TOML, Procfile, or code
        service: String,
    },
    /// Stream the logs of a service
    Echo {
        /// Service name from TOML, Procfile, or code
        service: String,
    },
    /// Open the FluentCI community Discord
    Community,
    #[command(name = "__engine-call", hide = true)]
    EngineCall {
        #[arg(long)]
        module: String,
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        commands: Vec<String>,
    },
    #[command(name = "provider-worker", hide = true)]
    ProviderWorker { request: PathBuf },
}

#[derive(Debug, Args)]
pub struct ExecuteArgs {
    /// Native host plan JSON produced by any FluentCI SDK
    pub plan: String,
    /// Fresh directory for execution logs, events, and results
    #[arg(long, required_unless_present = "dry_run")]
    pub run_dir: Option<String>,
    /// Progress display format
    #[arg(long, default_value = "auto", value_parser = ["auto", "plain", "tui", "json"])]
    pub progress: String,
    /// Select Git-affected tasks and their prerequisites
    #[arg(long, requires = "base")]
    pub affected: bool,
    /// Compare from the merge base of this revision and head
    #[arg(long, requires = "affected")]
    pub base: Option<String>,
    /// Git comparison head revision (defaults to HEAD)
    #[arg(long, requires = "affected")]
    pub head: Option<String>,
    /// Exclude staged, unstaged, and untracked changes
    #[arg(long, requires = "affected")]
    pub committed_only: bool,
    /// Repository-relative file/directory whose changes affect all tasks (repeatable)
    #[arg(long, requires = "affected")]
    pub global_input: Vec<PathBuf>,
    /// Print task selection and reasons as JSON without executing tasks
    #[arg(long)]
    pub dry_run: bool,
}

#[derive(Debug, Subcommand)]
pub enum ServiceCommand {
    /// Start definitions supplied by code, using the same schema as TOML services
    Apply {
        /// JSON array of service definitions
        #[arg(long, conflicts_with = "file", required_unless_present = "file")]
        json: Option<String>,
        /// JSON definition file; use - for stdin
        #[arg(long, conflicts_with = "json", required_unless_present = "json")]
        file: Option<PathBuf>,
    },
    /// Print structured service states and allocated ports
    Status {
        /// Output machine-readable JSON
        #[arg(long)]
        json: bool,
    },
    /// Run a command with ready services and release them afterward
    Run {
        /// Limit services to this name and its dependencies (repeatable)
        #[arg(long = "service")]
        services: Vec<String>,
        /// Program and literal arguments after --
        #[arg(required = true, trailing_var_arg = true, allow_hyphen_values = true)]
        command: Vec<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum ModuleCommand {
    /// Embed SDK-neutral function and typed argument metadata in a Wasm artifact
    Embed {
        /// Compiled Wasm module
        artifact: PathBuf,
        /// JSON manifest containing a functions array
        #[arg(long)]
        manifest: PathBuf,
        /// Destination artifact (defaults to replacing the input atomically)
        #[arg(long)]
        output: Option<PathBuf>,
    },
    /// Scaffold and declare another workspace module
    Add {
        /// Unique name used to invoke the module
        name: String,
        /// SDK used by the module
        #[arg(long, value_enum, default_value = "rust")]
        sdk: Sdk,
        /// Wasm ABI used by the module (supported by every SDK)
        #[arg(long, value_enum, default_value = "component")]
        runtime: ModuleRuntime,
        /// Register an existing module instead of generating one
        #[arg(long, conflicts_with = "url")]
        path: Option<PathBuf>,
        /// Register an HTTP(S) URL to a compiled .wasm module
        #[arg(long, conflicts_with = "path")]
        url: Option<String>,
        /// Elixir plugin module or Python entry file for an existing module
        #[arg(long, requires = "path")]
        entry: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum AgentCommand {
    /// List agents registered to the authenticated account
    #[command(alias = "ls")]
    List,
}

#[derive(Debug, Subcommand)]
pub enum ProjectCommand {
    /// Create a project to associate with a working directory
    Create,
    /// List saved projects
    List,
    /// Show a saved project's details
    Show {
        /// Project name or ID
        name: String,
    },
    /// Export saved project actions as a CI manifest
    Export {
        /// Workflow ID to export
        #[arg(long, default_value = "default")]
        workflow: String,
        /// Project name or ID (defaults to the current directory's project)
        name: Option<String>,
        /// Generate a GitHub Actions workflow (the default provider)
        #[arg(long, group = "provider")]
        github: bool,
        /// Generate an Azure Pipelines manifest
        #[arg(long, group = "provider")]
        azure: bool,
        /// Generate a GitLab CI manifest
        #[arg(long, group = "provider")]
        gitlab: bool,
        /// Generate a CircleCI manifest
        #[arg(long, group = "provider")]
        circleci: bool,
        /// Generate a Semaphore pipeline
        #[arg(long, group = "provider")]
        semaphore: bool,
        /// Generate an AWS CodeBuild buildspec
        #[arg(long, group = "provider")]
        aws: bool,
    },
}

#[derive(Debug, Clone, Default, Args)]
pub struct AddArgs {
    /// Registry module reference, URL, local path, or alias when using a source flag
    pub module: String,
    /// Dependency alias used in imports and function calls
    #[arg(long)]
    pub alias: Option<String>,
    /// Local module directory or prebuilt Wasm artifact
    #[arg(long, conflicts_with_all=["url","git"])]
    pub path: Option<PathBuf>,
    /// Public Wasm artifact URL
    #[arg(long, conflicts_with_all=["path","git"])]
    pub url: Option<String>,
    /// Git repository containing the module
    #[arg(long, conflicts_with_all=["path","url"])]
    pub git: Option<String>,
    /// Git branch, tag, or commit
    #[arg(long, requires = "git")]
    pub rev: Option<String>,
    /// Module source subdirectory inside a Git repository
    #[arg(long, requires = "git")]
    pub subdir: Option<PathBuf>,
}
