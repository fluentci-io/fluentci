use crate::state::State;
use extism::{convert::Json, *};

host_fn!(pub pipeline(user_data: State; name: String) -> Json<Pipeline> {
    fluentci_common::host::pipeline(&user_data.get()?, name).map(|value| Json(value.into_inner()))
});
