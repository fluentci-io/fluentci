use crate::state::State;
use extism::{convert::Json, *};

host_fn!(pub directory(user_data: State; path: String) -> Json<Directory> {
    fluentci_common::host::directory(&user_data.get()?, path).map(|value| Json(value.into_inner()))
});

host_fn!(pub entries(user_data: State; path: String) -> Json<Vec<String>> {
    fluentci_common::host::entries(&user_data.get()?, path).map(|value| Json(value.into_inner()))
});
