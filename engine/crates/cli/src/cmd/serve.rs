use anyhow::Error;
use fluentci_server::start;
use regex::Regex;

pub async fn serve(listen: &str) -> Result<(), Error> {
    if !Regex::new(r"^(?:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|localhost):\d+$")
        .unwrap()
        .is_match(listen)
    {
        return Err(Error::msg("Invalid listen address"));
    }
    start(listen).await
}
