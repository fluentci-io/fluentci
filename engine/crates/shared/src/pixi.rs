use crate::state::State;
use extism::{convert::Json, *};

host_fn!(pub pixi(user_data: State;) -> Json<Pixi> {
    fluentci_common::host::pixi(&user_data.get()?).map(|value| Json(value.into_inner()))
});
