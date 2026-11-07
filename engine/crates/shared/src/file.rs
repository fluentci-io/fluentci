use crate::state::State;
use extism::{convert::Json, *};
use fluentci_types::file::Chmod;

host_fn!(pub file(user_data: State; path: String) -> Json<File> {
    fluentci_common::host::file(&user_data.get()?, path).map(|value| Json(value.into_inner()))
});

host_fn!(pub unzip(user_data: State; path: String) -> Json<Directory> {
    fluentci_common::host::unzip(&user_data.get()?, path).map(|value| Json(value.into_inner()))
});

host_fn!(pub tar_xzvf(user_data: State; path: String) -> Json<Directory> {
    fluentci_common::host::tar_xzvf(&user_data.get()?, path).map(|value| Json(value.into_inner()))
});

host_fn!(pub md5(user_data: State; path: String) -> String {
    fluentci_common::host::md5(&user_data.get()?, path)
});

host_fn!(pub sha256(user_data: State; path: String) -> String {
    fluentci_common::host::sha256(&user_data.get()?, path)
});

host_fn!(pub chmod(user_data: State; options: Json<Chmod>) -> Result<Json<File>, Error> {
    fluentci_common::host::chmod(&user_data.get()?, fluentci_common::host::Json(options.into_inner())).map(|value| Json(value.into_inner()))
});
