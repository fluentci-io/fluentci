use crate::state::State;
use extism::{convert::Json, *};
use fluentci_types::nix::NixArgs;

host_fn!(pub nix(user_data: State; args: Json<NixArgs>) -> Json<Nix> {
    fluentci_common::host::nix(&user_data.get()?, fluentci_common::host::Json(args.into_inner())).map(|value| Json(value.into_inner()))
});
