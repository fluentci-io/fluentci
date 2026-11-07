use crate::component::*;
use fluentci_types::{cache::Cache, directory as types, nix::NixArgs, service::Service};
use serde::{Deserialize, Serialize};

use super::{
    devbox::Devbox, devenv::Devenv, envhub::Envhub, file::File, flox::Flox, mise::Mise, nix::Nix,
    pixi::Pixi, pkgx::Pkgx, proto::Proto,
};

include!("generated/directory_imports.rs");

#[derive(Serialize, Deserialize)]
pub struct Directory {
    pub id: String,
    pub path: String,
}

impl From<types::Directory> for Directory {
    fn from(directory: types::Directory) -> Self {
        Directory {
            id: directory.id,
            path: directory.path,
        }
    }
}

impl Directory {
    pub fn directory(&self, path: &str) -> Result<Directory, Error> {
        let directory = unsafe { directory(path.into()) }?;
        Ok(directory.into_inner())
    }

    pub fn entries(&self) -> Result<Vec<String>, Error> {
        let entries = unsafe { entries(self.path.clone()) }?;
        Ok(entries.into_inner())
    }

    pub fn devbox(&self) -> Result<Devbox, Error> {
        let devbox = unsafe { devbox() }?;
        Ok(devbox.into_inner())
    }

    pub fn devenv(&self) -> Result<Devenv, Error> {
        let devenv = unsafe { devenv() }?;
        Ok(devenv.into_inner())
    }

    pub fn flox(&self) -> Result<Flox, Error> {
        let flox = unsafe { flox() }?;
        Ok(flox.into_inner())
    }

    pub fn nix(&self, args: NixArgs) -> Result<Nix, Error> {
        let nix = unsafe { nix(Json(args)) }?;
        Ok(nix.into_inner())
    }

    pub fn pkgx(&self) -> Result<Pkgx, Error> {
        let pkgx = unsafe { pkgx() }?;
        Ok(pkgx.into_inner())
    }

    pub fn pixi(&self) -> Result<Pixi, Error> {
        let pixi = unsafe { pixi() }?;
        Ok(pixi.into_inner())
    }

    pub fn mise(&self) -> Result<Mise, Error> {
        let mise = unsafe { mise() }?;
        Ok(mise.into_inner())
    }

    pub fn proto(&self) -> Result<Proto, Error> {
        let proto = unsafe { proto() }?;
        Ok(proto.into_inner())
    }

    pub fn envhub(&self) -> Result<Envhub, Error> {
        let envhub = unsafe { envhub() }?;
        Ok(envhub.into_inner())
    }

    pub fn tar_czvf(&self) -> Result<File, Error> {
        let file = unsafe { tar_czvf(self.path.clone()) }?;
        Ok(file.into_inner())
    }

    pub fn zip(&self) -> Result<File, Error> {
        let file = unsafe { zip(self.path.clone()) }?;
        Ok(file.into_inner())
    }

    pub fn with_exec(&self, args: Vec<&str>) -> Result<Directory, Error> {
        unsafe {
            with_exec(Json::from(
                args.into_iter()
                    .map(|x| x.to_string())
                    .collect::<Vec<String>>(),
            ))
        }?;
        Ok(Directory {
            id: self.id.clone(),
            path: self.path.clone(),
        })
    }

    pub fn with_workdir(&self, path: String) -> Result<Directory, Error> {
        unsafe { with_workdir(path.clone()) }?;
        Ok(Directory {
            id: self.id.clone(),
            path,
        })
    }

    pub fn with_cache(&self, path: String, cache_id: String) -> Result<Directory, Error> {
        unsafe {
            with_cache(Json(Cache {
                id: cache_id,
                path: path.clone(),
                ..Default::default()
            }))
        }?;
        Ok(Directory {
            id: self.id.clone(),
            path: self.path.clone(),
        })
    }

    pub fn with_file(&self, path: &str, file_id: &str) -> Result<Directory, Error> {
        unsafe {
            with_file(Json(File {
                id: file_id.into(),
                path: path.into(),
            }))
        }?;
        Ok(Directory {
            id: self.id.clone(),
            path: self.path.clone(),
        })
    }

    pub fn stdout(&self) -> Result<String, Error> {
        unsafe { stdout() }
    }

    pub fn stderr(&self) -> Result<String, Error> {
        unsafe { stderr() }
    }

    pub fn as_service(&self, name: &str) -> Result<String, Error> {
        let service = unsafe { as_service(name.into())? };
        Ok(service.into_inner().id)
    }

    pub fn with_service(&self, service_id: &str) -> Result<Directory, Error> {
        unsafe { with_service(service_id.into())? }
        Ok(Directory {
            id: self.id.clone(),
            path: self.path.clone(),
        })
    }

    pub fn with_env_variable(&self, name: &str, value: &str) -> Result<Directory, Error> {
        unsafe { set_envs(Json(vec![(name.into(), value.into())]))? };
        Ok(Directory {
            id: self.id.clone(),
            path: self.path.clone(),
        })
    }

    pub fn wait_on(&self, port: u32, timeout: Option<u32>) -> Result<Directory, Error> {
        unsafe {
            wait_on(Json(vec![port, timeout.unwrap_or(60)]))?;
        }
        Ok(Directory {
            id: self.id.clone(),
            path: self.path.clone(),
        })
    }

    pub fn with_secret_variable(&self, name: &str, secret_id: &str) -> Result<Directory, Error> {
        unsafe {
            with_secret_variable(Json(vec![name.into(), secret_id.into()]))?;
        }
        Ok(Directory {
            id: self.id.clone(),
            path: self.path.clone(),
        })
    }
}
