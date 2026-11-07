use crate::state::State;
use extism::*;

host_fn!(pub execute_plan(user_data: State; request: String) -> String {
    fluentci_common::host::execute_plan(&user_data.get()?, request)
});
