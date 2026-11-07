use crate::component::*;
use fluentci_types::{cache::Cache, devenv as types, file::File, service::Service};
use serde::{Deserialize, Serialize};

include!("generated/devenv_imports.rs");

#[derive(Serialize, Deserialize)]
pub struct Devenv {
    pub id: String,
}

impl From<types::Devenv> for Devenv {
    fn from(devenv: types::Devenv) -> Self {
        Devenv { id: devenv.id }
    }
}

impl Devenv {
    pub fn with_exec(&self, args: Vec<&str>) -> Result<Devenv, Error> {
        unsafe { set_runner("devenv".into()) }?;
        unsafe {
            with_exec(Json::from(
                args.into_iter()
                    .map(|x| x.to_string())
                    .collect::<Vec<String>>(),
            ))
        }?;
        Ok(Devenv {
            id: self.id.clone(),
        })
    }

    pub fn with_workdir(&self, path: &str) -> Result<Devenv, Error> {
        unsafe { with_workdir(path.into()) }?;
        Ok(Devenv {
            id: self.id.clone(),
        })
    }

    pub fn with_cache(&self, path: &str, cache_id: &str) -> Result<Devenv, Error> {
        unsafe {
            with_cache(Json(Cache {
                id: cache_id.into(),
                path: path.into(),
                ..Default::default()
            }))
        }?;
        Ok(Devenv {
            id: self.id.clone(),
        })
    }

    pub fn with_file(&self, path: &str, file_id: &str) -> Result<Devenv, Error> {
        unsafe {
            with_file(Json(File {
                id: file_id.into(),
                path: path.into(),
            }))
        }?;
        Ok(Devenv {
            id: self.id.clone(),
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

    pub fn with_service(&self, service_id: &str) -> Result<Devenv, Error> {
        unsafe { with_service(service_id.into())? }
        Ok(Devenv {
            id: self.id.clone(),
        })
    }

    pub fn with_env_variable(&self, name: &str, value: &str) -> Result<Devenv, Error> {
        unsafe {
            set_envs(Json(vec![(name.into(), value.into())]))?;
        }
        Ok(Devenv {
            id: self.id.clone(),
        })
    }

    pub fn wait_on(&self, port: u32, timeout: Option<u32>) -> Result<Devenv, Error> {
        unsafe {
            wait_on(Json(vec![port, timeout.unwrap_or(60)]))?;
        }
        Ok(Devenv {
            id: self.id.clone(),
        })
    }

    pub fn with_secret_variable(&self, name: &str, secret_id: &str) -> Result<Devenv, Error> {
        unsafe {
            with_secret_variable(Json(vec![name.into(), secret_id.into()]))?;
        }
        Ok(Devenv {
            id: self.id.clone(),
        })
    }
}
