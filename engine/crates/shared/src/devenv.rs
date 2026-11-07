use crate::state::State;
use extism::{convert::Json, *};

host_fn!(pub devenv(user_data: State;) -> Json<Devenv> {
    fluentci_common::host::devenv(&user_data.get()?).map(|value| Json(value.into_inner()))
});
