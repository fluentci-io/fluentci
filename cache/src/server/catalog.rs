//! Metadata-only account index. R2 reconciliation never blocks a warm listing.
use async_trait::async_trait;
use chrono::Utc;
use futures_util::{TryStreamExt, stream::BoxStream};
use object_store::{
    GetOptions, GetResult, ListResult, MultipartUpload, ObjectMeta, ObjectStore,
    PutMultipartOptions, PutOptions, PutPayload, PutResult, Result, path::Path,
};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    fmt,
    sync::{Arc, RwLock},
    time::Duration,
};
use tokio::sync::Mutex;

#[derive(Debug, Default)]
struct Account {
    entries: BTreeMap<String, ObjectMeta>,
    bytes: u64,
}

#[derive(Debug, Default)]
struct State {
    ready: bool,
    accounts: BTreeMap<String, Account>,
    // Overlay protects writes/deletions that race with a paginated R2 scan.
    changes: BTreeMap<Path, Option<ObjectMeta>>,
    scanning: bool,
}

#[derive(Debug, Default)]
pub(super) struct Catalog {
    state: RwLock<State>,
    refresh: Mutex<()>,
}

fn apply(accounts: &mut BTreeMap<String, Account>, path: &Path, meta: Option<ObjectMeta>) {
    let path = path.as_ref();
    let Some((account, relative)) = path
        .strip_prefix("accounts/")
        .and_then(|s| s.split_once('/'))
    else {
        return;
    };
    let account = accounts.entry(account.to_owned()).or_default();
    if let Some(old) = account.entries.remove(relative) {
        account.bytes -= old.size;
    }
    if let Some(meta) = meta {
        account.bytes += meta.size;
        account.entries.insert(relative.to_owned(), meta);
    }
}

impl Catalog {
    pub(super) fn lookup(&self, path: &Path) -> Option<ObjectMeta> {
        let (account, relative) = path.as_ref().strip_prefix("accounts/")?.split_once('/')?;
        self.state
            .read()
            .unwrap()
            .accounts
            .get(account)?
            .entries
            .get(relative)
            .cloned()
    }

    fn change(&self, path: &Path, meta: Option<ObjectMeta>) {
        let mut state = self.state.write().unwrap();
        apply(&mut state.accounts, path, meta.clone());
        if state.scanning {
            state.changes.insert(path.clone(), meta);
        }
    }

    async fn reconcile(&self, store: &dyn ObjectStore, only_if_cold: bool) -> Result<()> {
        let _guard = self.refresh.lock().await;
        {
            let mut state = self.state.write().unwrap();
            if only_if_cold && state.ready {
                return Ok(());
            }
            state.scanning = true;
            state.changes.clear();
        }
        let scan = async {
            let mut entries = store.list(Some(&Path::from("accounts")));
            let mut accounts = BTreeMap::new();
            while let Some(meta) = entries.try_next().await? {
                apply(&mut accounts, &meta.location.clone(), Some(meta));
            }
            Ok(accounts)
        };
        let result = tokio::time::timeout(Duration::from_secs(120), scan).await;
        let mut state = self.state.write().unwrap();
        state.scanning = false;
        let result = match result {
            Ok(result) => result,
            Err(error) => Err(object_store::Error::Generic {
                store: "catalog",
                source: Box::new(error),
            }),
        };
        match result {
            Ok(mut accounts) => {
                for (path, meta) in std::mem::take(&mut state.changes) {
                    apply(&mut accounts, &path, meta);
                }
                state.accounts = accounts;
                state.ready = true;
                Ok(())
            }
            Err(error) => {
                state.changes.clear();
                Err(error)
            }
        }
    }

    pub(super) async fn page(
        &self,
        store: &dyn ObjectStore,
        account: &str,
        prefix: &str,
        cursor: &str,
        limit: usize,
    ) -> Result<Value> {
        if !self.state.read().unwrap().ready {
            self.reconcile(store, true).await?;
        }
        let state = self.state.read().unwrap();
        let Some(account) = state.accounts.get(account) else {
            return Ok(json!({"keys": [], "cursor": null, "totalBytes": 0, "totalKeys": 0}));
        };
        let start = prefix.max(cursor);
        let mut matches = account
            .entries
            .range(start.to_owned()..)
            .take_while(|(key, _)| key.starts_with(prefix))
            .filter(|(key, _)| key.as_str() > cursor);
        let mut keys = Vec::with_capacity(limit);
        for (key, meta) in matches.by_ref().take(limit) {
            keys.push(json!({"key": key, "size": meta.size, "lastModified": meta.last_modified.to_rfc3339()}));
        }
        let cursor = matches
            .next()
            .and_then(|_| keys.last().map(|key| key["key"].clone()));
        Ok(
            json!({"keys": keys, "cursor": cursor, "totalBytes": account.bytes, "totalKeys": account.entries.len()}),
        )
    }
}

#[derive(Debug)]
pub(super) struct IndexedStore {
    inner: Arc<dyn ObjectStore>,
    catalog: Arc<Catalog>,
}

impl IndexedStore {
    pub(super) fn new(inner: Arc<dyn ObjectStore>) -> (Arc<Self>, Arc<Catalog>) {
        let catalog = Arc::new(Catalog::default());
        let weak = Arc::downgrade(&catalog);
        let source = inner.clone();
        tokio::spawn(async move {
            while let Some(catalog) = weak.upgrade() {
                if let Err(error) = catalog.reconcile(source.as_ref(), false).await {
                    tracing::warn!(%error, "cache metadata reconciliation failed");
                }
                drop(catalog);
                tokio::time::sleep(Duration::from_secs(60)).await;
            }
        });
        (
            Arc::new(Self {
                inner,
                catalog: catalog.clone(),
            }),
            catalog,
        )
    }
}

impl fmt::Display for IndexedStore {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Indexed({})", self.inner)
    }
}

fn written(path: &Path, size: u64, result: &PutResult) -> ObjectMeta {
    ObjectMeta {
        location: path.clone(),
        size,
        last_modified: Utc::now(),
        e_tag: result.e_tag.clone(),
        version: result.version.clone(),
    }
}

#[async_trait]
impl ObjectStore for IndexedStore {
    async fn put_opts(
        &self,
        path: &Path,
        data: PutPayload,
        options: PutOptions,
    ) -> Result<PutResult> {
        let size = data.content_length() as u64;
        let result = self.inner.put_opts(path, data, options).await?;
        self.catalog
            .change(path, Some(written(path, size, &result)));
        Ok(result)
    }

    async fn put_multipart_opts(
        &self,
        path: &Path,
        options: PutMultipartOptions,
    ) -> Result<Box<dyn MultipartUpload>> {
        Ok(Box::new(IndexedUpload {
            inner: self.inner.put_multipart_opts(path, options).await?,
            path: path.clone(),
            size: 0,
            catalog: self.catalog.clone(),
        }))
    }

    async fn get_opts(&self, path: &Path, options: GetOptions) -> Result<GetResult> {
        self.inner.get_opts(path, options).await
    }

    async fn delete(&self, path: &Path) -> Result<()> {
        self.inner.delete(path).await?;
        self.catalog.change(path, None);
        Ok(())
    }

    fn list(&self, prefix: Option<&Path>) -> BoxStream<'static, Result<ObjectMeta>> {
        self.inner.list(prefix)
    }

    async fn list_with_delimiter(&self, prefix: Option<&Path>) -> Result<ListResult> {
        self.inner.list_with_delimiter(prefix).await
    }

    async fn copy(&self, from: &Path, to: &Path) -> Result<()> {
        self.inner.copy(from, to).await?;
        let meta = self.inner.head(to).await?;
        self.catalog.change(to, Some(meta));
        Ok(())
    }

    async fn copy_if_not_exists(&self, from: &Path, to: &Path) -> Result<()> {
        self.inner.copy_if_not_exists(from, to).await?;
        let meta = self.inner.head(to).await?;
        self.catalog.change(to, Some(meta));
        Ok(())
    }
}

#[derive(Debug)]
struct IndexedUpload {
    inner: Box<dyn MultipartUpload>,
    path: Path,
    size: u64,
    catalog: Arc<Catalog>,
}

#[async_trait]
impl MultipartUpload for IndexedUpload {
    fn put_part(
        &mut self,
        data: PutPayload,
    ) -> futures_util::future::BoxFuture<'static, Result<()>> {
        self.size += data.content_length() as u64;
        self.inner.put_part(data)
    }

    async fn complete(&mut self) -> Result<PutResult> {
        let result = self.inner.complete().await?;
        self.catalog
            .change(&self.path, Some(written(&self.path, self.size, &result)));
        Ok(result)
    }

    async fn abort(&mut self) -> Result<()> {
        self.inner.abort().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use object_store::memory::InMemory;

    #[tokio::test]
    async fn warm_pages_use_only_index_and_writes_keep_totals_current() {
        let backend = Arc::new(InMemory::new());
        backend
            .put(&Path::from("accounts/a/generic/a"), "old".into())
            .await
            .unwrap();
        backend
            .put(&Path::from("accounts/b/generic/private"), "private".into())
            .await
            .unwrap();
        let catalog = Arc::new(Catalog::default());
        catalog.reconcile(backend.as_ref(), false).await.unwrap();
        let store = IndexedStore {
            inner: backend.clone(),
            catalog: catalog.clone(),
        };
        let empty = InMemory::new();
        // An unrelated empty backend proves warm requests perform no storage listing.
        let page = catalog.page(&empty, "a", "", "", 1).await.unwrap();
        assert_eq!(page["totalBytes"], 3);
        assert_eq!(page["totalKeys"], 1);
        store
            .put(&Path::from("accounts/a/generic/a"), "overwrite".into())
            .await
            .unwrap();
        let mut upload = store
            .put_multipart(&Path::from("accounts/a/generic/b"))
            .await
            .unwrap();
        upload.put_part("part".into()).await.unwrap();
        assert_eq!(
            catalog.page(&empty, "a", "", "", 1).await.unwrap()["totalKeys"],
            1
        );
        upload.complete().await.unwrap();
        let first = catalog.page(&empty, "a", "generic/", "", 1).await.unwrap();
        assert_eq!(first["totalBytes"], 13);
        assert_eq!(first["totalKeys"], 2);
        assert_eq!(first["cursor"], "generic/a");
        let next = catalog
            .page(&empty, "a", "generic/", "generic/a", 1)
            .await
            .unwrap();
        assert_eq!(next["keys"][0]["key"], "generic/b");
        assert!(next["cursor"].is_null());
        assert!(
            catalog.page(&empty, "a", "absent/", "", 1).await.unwrap()["keys"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        store
            .delete(&Path::from("accounts/a/generic/a"))
            .await
            .unwrap();
        let page = catalog.page(&empty, "a", "", "", 100).await.unwrap();
        assert_eq!(page["totalBytes"], 4);
        assert_eq!(page["totalKeys"], 1);
        // An out-of-band change becomes visible after background reconciliation.
        backend
            .put(&Path::from("accounts/a/generic/c"), "external".into())
            .await
            .unwrap();
        catalog.reconcile(backend.as_ref(), false).await.unwrap();
        assert_eq!(
            catalog.page(&empty, "a", "", "", 100).await.unwrap()["totalKeys"],
            2
        );
    }
}
