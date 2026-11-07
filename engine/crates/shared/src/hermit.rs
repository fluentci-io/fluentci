use crate::state::State;
use extism::{convert::Json, *};

host_fn!(pub hermit(user_data: State;) -> Json<Hermit> {
    fluentci_common::host::hermit(&user_data.get()?).map(|value| Json(value.into_inner()))
});

host_fn!(pub install(user_data: State;) {
    fluentci_common::host::install(&user_data.get()?)
});
