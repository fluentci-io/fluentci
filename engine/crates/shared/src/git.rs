use crate::state::State;
use extism::{convert::Json, *};

host_fn!(pub git(user_data: State; url: String) -> Json<Git> {
    fluentci_common::host::git(&user_data.get()?, url).map(|value| Json(value.into_inner()))
});

host_fn!(pub branch(user_data: State; name: String) {
    fluentci_common::host::branch(&user_data.get()?, name)
});

host_fn!(pub commit(user_data: State;) -> String {
    fluentci_common::host::commit(&user_data.get()?)
});

host_fn!(pub tree(user_data: State;) -> Json<Directory> {
    fluentci_common::host::tree(&user_data.get()?).map(|value| Json(value.into_inner()))
});
