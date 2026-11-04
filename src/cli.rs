use clap::{Args, Parser, Subcommand};
use std::path::PathBuf;
#[derive(Debug, Parser)]
#[command(
    name = "fluentci",
    version,
    about = "FluentCI — CI/CD pipelines powered by Wasm and Dagger",
    subcommand_precedence_over_arg = true
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
    #[command(flatten)]
    pub run: RunArgs,
    /// SQLite database path
    #[arg(long, global=true, env="FLUENTCI_DATABASE", default_value_os_t=default_database())]
    pub database: PathBuf,
    #[arg(long, global=true, default_value="true", action=clap::ArgAction::Set)]
    pub check_update: bool,
}
fn default_database() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".fluentci/fluentci.db")
}
#[derive(Debug, Clone, Default, Args)]
pub struct RunArgs {
    #[arg(short = 'r', long)]
    pub reload: bool,
    #[arg(short = 'w', long)]
    pub wasm: bool,
    #[arg(long)]
    pub remote_exec: bool,
    #[arg(long)]
    pub work_dir: Option<PathBuf>,
    pub pipeline: Option<String>,
    #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
    pub jobs: Vec<String>,
}
#[derive(Debug, Subcommand)]
pub enum Command {
    /// Run a local or registry pipeline
    Run(RunArgs),
    /// Initialize a pipeline
    Init {
        name: Option<String>,
        #[arg(short, long)]
        template: Option<String>,
        #[arg(short, long)]
        standalone: bool,
        #[arg(short = 'w', long)]
        wasm: bool,
    },
    /// Search reusable pipelines
    Search {
        query: String,
        #[arg(short, long, default_value_t = 100)]
        limit: u32,
    },
    /// Cache TypeScript pipeline dependencies
    Cache {
        pipeline: Option<String>,
        #[arg(long)]
        lock_write: bool,
    },
    #[command(name = "ls", alias = "list")]
    Ls {
        pipeline: Option<String>,
    },
    #[command(alias = "man")]
    Docs {
        pipeline: Option<String>,
    },
    Doctor,
    Env,
    Login,
    Whoami,
    Upgrade,
    Publish {
        #[arg(short = 'w', long)]
        wasm: bool,
    },
    Agent {
        #[command(subcommand)]
        command: Option<AgentCommand>,
    },
    Repl {
        #[arg(long)]
        debug: bool,
        pipelines: Vec<String>,
    },
    Studio {
        #[arg(long, default_value_t = 6076)]
        port: u16,
    },
    Server {
        #[arg(long, default_value_t = 6076)]
        port: u16,
    },
    Project {
        #[command(subcommand)]
        command: ProjectCommand,
    },
    Up,
    Down,
    Ps,
    Status {
        service: String,
    },
    Start {
        service: String,
    },
    Restart {
        service: String,
    },
    Stop {
        service: String,
    },
    Echo {
        service: String,
    },
    Community,
    #[command(name = "__engine-call", hide = true)]
    EngineCall {
        #[arg(long)]
        module: String,
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        commands: Vec<String>,
    },
    #[command(name = "provider-worker", hide = true)]
    ProviderWorker {
        request: PathBuf,
    },
}
#[derive(Debug, Subcommand)]
pub enum AgentCommand {
    #[command(alias = "ls")]
    List,
}
#[derive(Debug, Subcommand)]
pub enum ProjectCommand {
    Create,
    List,
    Show {
        name: String,
    },
    Export {
        name: Option<String>,
        #[arg(long, group = "provider")]
        github: bool,
        #[arg(long, group = "provider")]
        azure: bool,
        #[arg(long, group = "provider")]
        gitlab: bool,
        #[arg(long, group = "provider")]
        circleci: bool,
        #[arg(long, group = "provider")]
        aws: bool,
    },
}
