use crate::state::State;
use extism::{convert::Json, *};

host_fn!(pub flox(user_data: State;) -> Json<Flox> {
    fluentci_common::host::flox(&user_data.get()?).map(|value| Json(value.into_inner()))
});
