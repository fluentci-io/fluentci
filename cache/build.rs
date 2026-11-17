fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_prost_build::configure().compile_protos(
        &[
            "proto/build/bazel/remote/execution/v2/remote_execution.proto",
            "proto/google/bytestream/bytestream.proto",
        ],
        &["proto"],
    )?;
    Ok(())
}
