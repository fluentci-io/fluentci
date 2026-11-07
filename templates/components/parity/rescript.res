let parity = (): string => {
  switch Guest.pipeline("component-parity")->Guest.exec(["printf", "capability-parity"])->Guest.stdout {
    | Ok(text) => text
    | Error(error) => error
  }
}

type helloArgs = {name: string}
let hello = (args: helloArgs): string => "Hello, " ++ args.name ++ "!"
