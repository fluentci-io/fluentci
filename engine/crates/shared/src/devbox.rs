use crate::state::State;
use extism::{convert::Json, *};

host_fn!(pub devbox(user_data: State;) -> Json<Devbox> {
    fluentci_common::host::devbox(&user_data.get()?).map(|value| Json(value.into_inner()))
});
