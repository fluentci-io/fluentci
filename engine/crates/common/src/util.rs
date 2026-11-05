pub fn extract_git_repo(url: &str) -> String {
    let mut repo = url
        .replace("https://", "")
        .replace("http://", "")
        .replace("git@", "")
        .replace(":", "/")
        .replace(".git", "");

    if repo.ends_with('/') {
        repo.pop();
    }

    // remove last part of the url
    // example:
    // github.com/owner/repo.git -> github.com/owner
    let mut parts: Vec<&str> = repo.split('/').collect();
    parts.pop();
    parts.join("/")
}

pub fn validate_git_url(url: &str) -> bool {
    regex::Regex::new(
        r"^(?:https:\/\/([^\/]+)\/([^\/]+)\/([^\/]+)|git@([^:]+):([^\/]+)\/([^\/]+))$",
    )
    .unwrap()
    .is_match(url)
}
