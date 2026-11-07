use crate::state::State;
use extism::{convert::Json, *};

host_fn!(pub mise(user_data: State;) -> Json<Mise> {
    fluentci_common::host::mise(&user_data.get()?).map(|value| Json(value.into_inner()))
});

host_fn!(pub trust(user_data: State;) {
    fluentci_common::host::trust(&user_data.get()?)
});
