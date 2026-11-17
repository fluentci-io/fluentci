//! Shared disk budget for resumable gRPC and OCI upload sessions.
use super::error::{Failure, Result};
use axum::http::StatusCode;
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

pub(super) struct Budget {
    used: AtomicU64,
    limit: u64,
    directory: Option<PathBuf>,
}

impl Budget {
    pub(super) fn new(limit: u64, directory: Option<PathBuf>) -> std::io::Result<Arc<Self>> {
        if let Some(path) = &directory {
            std::fs::create_dir_all(path)?;
        }
        Ok(Arc::new(Self {
            used: AtomicU64::new(0),
            limit,
            directory,
        }))
    }

    pub(super) fn file(&self) -> std::io::Result<tempfile::TempPath> {
        let file = match &self.directory {
            Some(path) => tempfile::NamedTempFile::new_in(path)?,
            None => tempfile::NamedTempFile::new()?,
        };
        Ok(file.into_temp_path())
    }

    pub(super) fn allocate(self: &Arc<Self>) -> Allocation {
        Allocation {
            budget: self.clone(),
            bytes: 0,
        }
    }
}

pub(super) struct Allocation {
    budget: Arc<Budget>,
    bytes: u64,
}

impl Allocation {
    pub(super) fn resize(&mut self, size: u64) -> Result<()> {
        if size > self.bytes {
            let extra = size - self.bytes;
            let mut used = self.budget.used.load(Ordering::Acquire);
            loop {
                let next = used
                    .checked_add(extra)
                    .filter(|next| *next <= self.budget.limit)
                    .ok_or(Failure(
                        StatusCode::INSUFFICIENT_STORAGE,
                        "upload staging budget exhausted; retry later\n",
                    ))?;
                match self.budget.used.compare_exchange_weak(
                    used,
                    next,
                    Ordering::AcqRel,
                    Ordering::Acquire,
                ) {
                    Ok(_) => break,
                    Err(current) => used = current,
                }
            }
        } else {
            self.budget
                .used
                .fetch_sub(self.bytes - size, Ordering::AcqRel);
        }
        self.bytes = size;
        Ok(())
    }
}

impl Drop for Allocation {
    fn drop(&mut self) {
        self.budget.used.fetch_sub(self.bytes, Ordering::AcqRel);
    }
}
