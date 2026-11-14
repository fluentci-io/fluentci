//! Typed sequential composition of native primitives and component operations.
//! Construction is pure. `run` is the only terminal operation.
use crate::dag;
use crate::component::*;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct Context {
    pub name: String,
    pub project: String,
    run_id: String,
    sequence: usize,
}
impl Context {
    pub fn next_run_dir(&mut self) -> String {
        self.sequence += 1;
        format!(".fluentci/runs/{}/{}", self.run_id, self.sequence)
    }
}
type Action<T> = Box<dyn FnOnce(&mut Context) -> Result<T, Error>>;
pub struct Operation<T>(Action<T>);
impl<T> Operation<T> {
    pub fn new(action: impl FnOnce(&mut Context) -> Result<T, Error> + 'static) -> Self {
        Self(Box::new(action))
    }
}
pub struct Pipeline<T> {
    name: String,
    action: Action<T>,
}
pub fn pipeline(name: impl Into<String>) -> Pipeline<()> {
    Pipeline {
        name: name.into(),
        action: Box::new(|_| Ok(())),
    }
}
impl<T: 'static> Pipeline<T> {
    pub fn then<U: 'static>(self, operation: Operation<U>) -> Pipeline<U> {
        self.then_with(move |_| operation)
    }
    pub fn then_with<U: 'static>(
        self,
        operation: impl FnOnce(T) -> Operation<U> + 'static,
    ) -> Pipeline<U> {
        Pipeline {
            name: self.name,
            action: Box::new(move |context| {
                let previous = (self.action)(context)?;
                (operation(previous).0)(context)
            }),
        }
    }
    pub fn map<U: 'static>(self, project: impl FnOnce(T) -> U + 'static) -> Pipeline<U> {
        self.then_with(move |value| Operation::new(move |_| Ok(project(value))))
    }
    pub fn workdir(self, path: impl Into<String>) -> Self {
        let path = path.into();
        self.then_with(move |value| {
            Operation::new(move |context| {
                if path.is_empty() || path.contains('\0') {
                    return Err(Error::msg("Invalid working directory"));
                }
                context.project = path;
                Ok(value)
            })
        })
    }
    pub fn exec(self, argv: Vec<String>) -> Pipeline<String> {
        self.then(Operation::new(move |context| {
            if argv.is_empty() || argv[0].is_empty() || argv.iter().any(|v| v.contains('\0')) {
                return Err(Error::msg("exec requires NUL-free literal argv"));
            }
            let quoted = argv
                .iter()
                .map(|v| format!("'{}'", v.replace('\'', "'\\''")))
                .collect::<Vec<_>>();
            dag()
                .pipeline(&context.name)?
                .with_workdir(&context.project)?
                .with_exec(quoted.iter().map(String::as_str).collect())?
                .stdout()
        }))
    }
    pub fn run(self) -> Result<T, Error> {
        let run_id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| Error::msg(e.to_string()))?
            .as_nanos()
            .to_string();
        (self.action)(&mut Context {
            name: self.name,
            project: ".".into(),
            run_id,
            sequence: 0,
        })
    }
}
