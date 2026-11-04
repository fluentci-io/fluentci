use clap::{
    Args, Parser, Subcommand,
    builder::{Styles, styling::RgbColor},
};
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(
    name = "fluentci",
    version,
    about = "FluentCI — CI/CD pipelines powered by Wasm and Dagger",
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
    /// Reload cached TypeScript pipeline sources
    #[arg(short = 'r', long)]
    pub reload: bool,
    /// Execute the pipeline as a WebAssembly plugin
    #[arg(short = 'w', long)]
    pub wasm: bool,
    /// Run on a hosted agent (requires FLUENTCI_PROJECT_ID)
    #[arg(long)]
    pub remote_exec: bool,
    /// Working directory for the pipeline
    #[arg(long)]
    pub work_dir: Option<PathBuf>,
    /// Local pipeline, module path, or registry package (defaults to .)
    pub pipeline: Option<String>,
    /// Job names or plugin arguments, including plugin flags
    #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
    pub jobs: Vec<String>,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Run a local or registry pipeline
    Run(RunArgs),
    /// Initialize a pipeline or reusable Wasm plugin
    Init {
        /// Name for the generated pipeline or plugin
        name: Option<String>,
        /// Registry template to copy, optionally pinned with @version
        #[arg(short, long)]
        template: Option<String>,
        /// Generate a reusable package in the current directory
        #[arg(short, long)]
        standalone: bool,
        /// Generate a Rust WebAssembly plugin
        #[arg(short = 'w', long)]
        wasm: bool,
    },
    /// Search for reusable pipelines in the registry
    Search {
        /// Search terms
        query: String,
        /// Maximum number of results
        #[arg(short, long, default_value_t = 100)]
        limit: u32,
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
    /// Save an access token for hosted FluentCI services
    Login,
    /// Show the currently authenticated user
    Whoami,
    /// Install the latest published CLI release
    Upgrade,
    /// Publish the current package to the registry
    Publish {
        /// Build and publish a WebAssembly plugin
        #[arg(short = 'w', long)]
        wasm: bool,
    },
    /// Start a hosted runner agent or list registered agents
    Agent {
        #[command(subcommand)]
        command: Option<AgentCommand>,
    },
    /// Start an interactive Deno/Dagger pipeline session
    Repl {
        /// Enable Dagger debug logging
        #[arg(long)]
        debug: bool,
        /// Registry pipelines to import into the session
        pipelines: Vec<String>,
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
    /// Start all services discovered in Procfiles
    Up,
    /// Stop all services discovered in Procfiles
    Down,
    /// List services and their process status
    Ps,
    /// Show the status of a service
    Status {
        /// Service name from a Procfile
        service: String,
    },
    /// Start or restart a service
    Start {
        /// Service name from a Procfile
        service: String,
    },
    /// Restart a service
    Restart {
        /// Service name from a Procfile
        service: String,
    },
    /// Stop a service
    Stop {
        /// Service name from a Procfile
        service: String,
    },
    /// Stream the logs of a service
    Echo {
        /// Service name from a Procfile
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
        /// Generate an AWS CodeBuild buildspec
        #[arg(long, group = "provider")]
        aws: bool,
    },
}
