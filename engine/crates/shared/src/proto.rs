use crate::state::State;
use extism::{convert::Json, *};

host_fn!(pub proto(user_data: State;) -> Json<Proto> {
    fluentci_common::host::proto(&user_data.get()?).map(|value| Json(value.into_inner()))
});
