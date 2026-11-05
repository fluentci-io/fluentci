use std::{
    env,
    process::{Command, ExitStatus, Stdio},
    sync::mpsc::Sender,
};
use users::get_current_username;

use crate::{exec, Extension};
use anyhow::Error;
use fluentci_types::{nix::NixArgs, Output};

#[derive(Default, Clone)]
pub struct Nix {
    pub args: NixArgs,
}

impl Nix {
    pub fn new(args: NixArgs) -> Self {
        Self { args }
    }

    pub fn impure(&mut self) -> &mut Self {
        self.args.impure = true;
        self
    }

    pub fn build_args(&self) -> String {
        let mut args = vec![];
        if self.args.impure {
            args.push("--impure".to_string());
        }
        args.join(" ")
    }
}

impl Extension for Nix {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Nix {
            impure: self.args.impure,
        })
    }

    fn exec(
        &mut self,
        cmd: &str,
        tx: Sender<String>,
        out: Output,
        last_cmd: bool,
        work_dir: &str,
    ) -> Result<ExitStatus, Error> {
        self.setup()?;

        if cmd.is_empty() {
            return Ok(ExitStatus::default());
        }

        let args = self.build_args();

        let status = Command::new("bash")
            .arg("-c")
            .arg("[ -f flake.nix ] || nix --extra-experimental-features 'nix-command flakes' flake init")
            .current_dir(work_dir)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()?
            .wait()?;

        if !status.success() {
            return Err(crate::worker::command_failure(
                &status,
                "Nix flake initialization failed; command was not executed",
            ));
        }
        let cmd = format!(
            "nix --extra-experimental-features 'nix-command flakes' develop {} -c {}",
            args, cmd
        );
        exec(&cmd, tx, out, last_cmd, work_dir)
    }

    fn setup(&self) -> Result<(), Error> {
        let user = match get_current_username() {
            Some(user) => user.to_string_lossy().to_string(),
            None => "root".to_string(),
        };

        env::set_var("USER", user);
        env::set_var("SHELL", "/bin/bash");

        let home = match env::var("HOME") {
            Ok(home) => home,
            Err(_) => "/root".to_string(),
        };
        let nix_path = format!("{}/.nix-profile/bin", home);
        env::set_var(
            "PATH",
            format!(
                "{}:{}:{}",
                env::var("PATH")?,
                "/nix/var/nix/profiles/default/bin",
                nix_path
            ),
        );

        let mut child = Command::new("sh")
            .arg("-c")
            .arg("type systemctl > /dev/null 2> /dev/null")
            .spawn()?;
        let status = child.wait()?;
        let init = match status.code() {
            Some(0) => "",
            _ => "--init none",
        };

        let mut args = vec!["install"];
        if std::env::consts::OS == "linux" {
            args.extend(["linux", "--extra-conf", "sandbox = false"]);
            if !init.is_empty() {
                args.extend(["--init", "none"]);
            }
        }
        args.push("--no-confirm");
        crate::bootstrap::install(
            "nix",
            "https://install.determinate.systems/nix",
            "/bin/sh",
            &args,
            &[],
        )?;
        Ok(())
    }

    fn format_command(&self, cmd: &str) -> String {
        let args = self.build_args();
        format!(
            "([ -f flake.nix ] || nix --extra-experimental-features 'nix-command flakes' flake init) && nix --extra-experimental-features 'nix-command flakes' develop {} -c {}",
            args, cmd
        )
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn formatted_commands_enable_features_and_stop_after_failed_initialization() {
        for fail_init in [false, true] {
            let root = tempfile::tempdir().unwrap();
            let mut nix = Nix::default();
            nix.impure();
            let command = nix.format_command("true");
            let stub = format!(
                r#"nix() {{
                [ "$1" = --extra-experimental-features ] || return 81
                [ "$2" = 'nix-command flakes' ] || return 82
                shift 2
                if [ "$1" = flake ]; then
                    [ "$2" = init ] || return 83
                    [ '{}' = false ] || return 9
                    printf initialized > flake.nix
                else
                    [ "$1" = develop ] || return 84
                    [ "$2" = --impure ] || return 85
                    printf developed > activated
                fi
            }}; {}"#,
                fail_init, command
            );
            let status = Command::new("/bin/sh")
                .args(["-c", &stub])
                .current_dir(root.path())
                .status()
                .unwrap();
            assert_eq!(status.success(), !fail_init);
            assert_eq!(root.path().join("activated").exists(), !fail_init);
        }
    }
}
