use crate::state::State;
use extism::{convert::Json, *};

host_fn!(pub pkgx(user_data: State;) -> Json<Pkgx> {
    fluentci_common::host::pkgx(&user_data.get()?).map(|value| Json(value.into_inner()))
});

host_fn!(pub with_packages(user_data: State; packages: Json<Vec<String>>) {
    fluentci_common::host::with_packages(&user_data.get()?, fluentci_common::host::Json(packages.into_inner()))
});
