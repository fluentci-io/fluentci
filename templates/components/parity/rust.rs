use fluentci_pdk::{dag, component::Error};
pub fn parity() -> Result<String, String> {
    let run = || -> Result<String, Error> {
        let directory = format!("{}/typed-plan", dag().get_env("FLUENTCI_COMPONENT_RUN_DIR")?);
        let pipeline = dag().pipeline("component-parity")?;
        dag().set_envs(vec![("FLUENTCI_COMPONENT_PARITY".into(), "capability-parity".into())])?;
        let output = pipeline.with_exec(vec!["printf '%s' \"$FLUENTCI_COMPONENT_PARITY\""])?.stdout()?;
        let plan = serde_json::json!({"version":1,"tasks":[{"id":"digest","cwd":".","program":"","primitive":{"kind":"digest","algorithm":"sha256","input":{"source":"text","value":"abc"}}}]});
        let report = fluentci_pdk::component::execute_plan_value(&plan,&directory)?;
        if report["outcome"] != "succeeded" {return Err(Error::msg(format!("{report}")));}
        Ok(output)
    };
    run().map_err(|error| error.to_string())
}

pub struct HelloArgs { pub name: String }
/// Greet someone from a native Wasm component.
pub fn hello(args: HelloArgs) -> String {format!("Hello, {}!",args.name)}
