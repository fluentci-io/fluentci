use crate::state::State;
use extism::{convert::Json, *};

host_fn!(pub envhub(user_data: State;) -> Json<Envhub> {
    fluentci_common::host::envhub(&user_data.get()?).map(|value| Json(value.into_inner()))
});
