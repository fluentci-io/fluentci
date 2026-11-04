use extism_pdk::*;
use fluentci_types::{cache::Cache, file::File, pkgx as types, service::Service};
use serde::{Deserialize, Serialize};

include!("generated/pkgx_imports.rs");

#[derive(Serialize, Deserialize)]
pub struct Pkgx {
    pub id: String,
}

impl From<types::Pkgx> for Pkgx {
    fn from(pkgx: types::Pkgx) -> Self {
        Pkgx { id: pkgx.id }
    }
}

impl Pkgx {
    pub fn with_exec(&self, args: Vec<&str>) -> Result<Pkgx, Error> {
        unsafe { set_runner("pkgx".into()) }?;
        unsafe {
            with_exec(Json::from(
                args.into_iter()
                    .map(|x| x.to_string())
                    .collect::<Vec<String>>(),
            ))
        }?;
        Ok(Pkgx {
            id: self.id.clone(),
        })
    }

    pub fn with_file(&self, path: &str, file_id: &str) -> Result<Pkgx, Error> {
        unsafe {
            with_file(Json(File {
                id: file_id.into(),
                path: path.into(),
            }))
        }?;
        Ok(Pkgx {
            id: self.id.clone(),
        })
    }

    pub fn with_workdir(&self, path: &str) -> Result<Pkgx, Error> {
        unsafe { with_workdir(path.into()) }?;
        Ok(Pkgx {
            id: self.id.clone(),
        })
    }

    pub fn with_cache(&self, path: &str, cache_id: &str) -> Result<Pkgx, Error> {
        unsafe {
            with_cache(Json(Cache {
                id: cache_id.into(),
                path: path.into(),
                ..Default::default()
            }))
        }?;
        Ok(Pkgx {
            id: self.id.clone(),
        })
    }

    pub fn with_packages(&self, packages: Vec<&str>) -> Result<Pkgx, Error> {
        unsafe {
            with_packages(Json::from(
                packages
                    .into_iter()
                    .map(|x| x.to_string())
                    .collect::<Vec<String>>(),
            ))
        }?;
        Ok(Pkgx {
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

    pub fn with_service(&self, service_id: &str) -> Result<Pkgx, Error> {
        unsafe { with_service(service_id.into())? }
        Ok(Pkgx {
            id: self.id.clone(),
        })
    }

    pub fn with_env_variable(&self, name: &str, value: &str) -> Result<Pkgx, Error> {
        unsafe {
            set_envs(Json(vec![(name.into(), value.into())]))?;
        }
        Ok(Pkgx {
            id: self.id.clone(),
        })
    }

    pub fn wait_on(&self, port: u32, timeout: Option<u32>) -> Result<Pkgx, Error> {
        unsafe {
            wait_on(Json(vec![port, timeout.unwrap_or(60)]))?;
        }
        Ok(Pkgx {
            id: self.id.clone(),
        })
    }

    pub fn with_secret_variable(&self, name: &str, secret_id: &str) -> Result<Pkgx, Error> {
        unsafe {
            with_secret_variable(Json(vec![name.into(), secret_id.into()]))?;
        }
        Ok(Pkgx {
            id: self.id.clone(),
        })
    }
}
