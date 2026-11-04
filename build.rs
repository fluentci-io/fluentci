fn main() {
    println!("cargo:rerun-if-changed=webui/dist");
    if !std::path::Path::new("webui/dist/index.html").is_file() {
        panic!(
            "Build Studio before compiling FluentCI: cd webui && bun install --frozen-lockfile --ignore-scripts && bun run build:web"
        );
    }
}
