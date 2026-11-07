use crate::state::State;
use extism::{convert::Json, *};

host_fn!(pub http(user_data: State; url: String) -> Json<File> {
    fluentci_common::host::http(&user_data.get()?, url).map(|value| Json(value.into_inner()))
});
