use crate::component::*;
use fluentci_types::git as types;
use serde::{Deserialize, Serialize};

use super::directory::Directory;

include!("generated/git_imports.rs");

#[derive(Serialize, Deserialize)]
pub struct Git {
    pub id: String,
}

impl From<types::Git> for Git {
    fn from(git: types::Git) -> Self {
        Git { id: git.id }
    }
}

impl Git {
    pub fn branch(&self, name: &str) -> Result<Git, Error> {
        unsafe { branch(name.into()) }?;
        Ok(Git {
            id: self.id.clone(),
        })
    }

    pub fn commit(&self) -> Result<String, Error> {
        unsafe { commit() }
    }

    pub fn tree(&self) -> Result<Directory, Error> {
        unsafe { tree() }.map(|directory| directory.into_inner())
    }
}
