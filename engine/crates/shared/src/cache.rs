use crate::state::State;
use extism::{convert::Json, *};

host_fn!(pub cache(user_data: State; key: String) -> Json<Cache> {
    fluentci_common::host::cache(&user_data.get()?, key).map(|value| Json(value.into_inner()))
});
