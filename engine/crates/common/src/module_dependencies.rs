//! Portable dependency bundles for core-Wasm modules. No machine-local paths are embedded.

use crate::host::Context;
use anyhow::{ensure, Context as _, Result};
use std::collections::BTreeMap;

const SECTION: &str = "fluentci:dependencies";
const MAX_BYTES: usize = 64 * 1024 * 1024;

fn take<'a>(bytes: &mut &'a [u8], count: usize) -> Result<&'a [u8]> {
    ensure!(count <= bytes.len(), "Truncated module dependency bundle");
    let (head, tail) = bytes.split_at(count);
    *bytes = tail;
    Ok(head)
}

fn leb(bytes: &mut &[u8]) -> Result<usize> {
    let mut value = 0u32;
    for shift in (0..35).step_by(7) {
        let byte = take(bytes, 1)?[0];
        ensure!(shift < 28 || byte & 0xf0 == 0, "Invalid section length");
        value |= u32::from(byte & 0x7f) << shift;
        if byte & 0x80 == 0 {
            return Ok(value as usize);
        }
    }
    anyhow::bail!("Invalid section length")
}

fn encode(mut value: usize, output: &mut Vec<u8>) {
    loop {
        let byte = (value & 0x7f) as u8;
        value >>= 7;
        output.push(byte | if value == 0 { 0 } else { 0x80 });
        if value == 0 {
            break;
        }
    }
}

type Section<'a> = (usize, usize, bool, &'a [u8]);

fn sections(bytes: &[u8]) -> Result<Vec<Section<'_>>> {
    ensure!(
        bytes.starts_with(b"\0asm") && bytes.len() >= 8,
        "Expected a Wasm artifact"
    );
    let mut rest = &bytes[8..];
    let mut output = vec![];
    while !rest.is_empty() {
        let start = bytes.len() - rest.len();
        let id = take(&mut rest, 1)?[0];
        let size = leb(&mut rest)?;
        let mut payload = take(&mut rest, size)?;
        let matched = if id == 0 {
            let size = leb(&mut payload)?;
            take(&mut payload, size)? == SECTION.as_bytes()
        } else {
            false
        };
        output.push((start, bytes.len() - rest.len(), matched, payload));
    }
    Ok(output)
}

pub fn read(bytes: &[u8]) -> Result<BTreeMap<String, Vec<u8>>> {
    let mut output = BTreeMap::new();
    let mut found = false;
    for (_, _, matched, mut payload) in sections(bytes)? {
        if !matched {
            continue;
        }
        ensure!(!found, "Duplicate dependency bundle");
        found = true;
        ensure!(
            payload.len() <= MAX_BYTES && take(&mut payload, 1)? == [1],
            "Unsupported dependency bundle"
        );
        let count = leb(&mut payload)?;
        ensure!(count <= 128, "Too many module dependencies");
        for _ in 0..count {
            let size = leb(&mut payload)?;
            let name = std::str::from_utf8(take(&mut payload, size)?)?.to_owned();
            ensure!(
                !name.is_empty() && name.len() <= 128,
                "Invalid dependency alias"
            );
            let size = leb(&mut payload)?;
            let artifact = take(&mut payload, size)?;
            ensure!(
                artifact.starts_with(b"\0asm") && artifact.len() >= 8,
                "Invalid dependency artifact"
            );
            ensure!(
                output.insert(name, artifact.to_vec()).is_none(),
                "Duplicate dependency alias"
            );
        }
        ensure!(payload.is_empty(), "Trailing dependency bundle bytes");
    }
    Ok(output)
}

pub fn embed(bytes: &[u8], dependencies: &BTreeMap<String, Vec<u8>>) -> Result<Vec<u8>> {
    ensure!(dependencies.len() <= 128, "Too many dependencies");
    let mut output = bytes[..bytes.len().min(8)].to_vec();
    for (start, end, matched, _) in sections(bytes)? {
        if !matched {
            output.extend_from_slice(&bytes[start..end]);
        }
    }
    if dependencies.is_empty() {
        return Ok(output);
    }
    let mut payload = vec![];
    encode(SECTION.len(), &mut payload);
    payload.extend_from_slice(SECTION.as_bytes());
    payload.push(1);
    encode(dependencies.len(), &mut payload);
    for (name, artifact) in dependencies {
        ensure!(
            !name.is_empty() && name.len() <= 128 && artifact.starts_with(b"\0asm"),
            "Invalid dependency"
        );
        encode(name.len(), &mut payload);
        payload.extend_from_slice(name.as_bytes());
        encode(artifact.len(), &mut payload);
        payload.extend_from_slice(artifact);
        ensure!(
            payload.len() <= MAX_BYTES,
            "Dependency bundle exceeds 64 MiB"
        );
    }
    output.push(0);
    encode(payload.len(), &mut output);
    output.extend(payload);
    Ok(output)
}

pub struct Scope(Context);

impl Scope {
    pub fn enter(context: &Context, bytes: &[u8]) -> Result<Self> {
        let dependencies = read(bytes).context("Reading module dependencies")?;
        context.lock().unwrap().dependency_scopes.push(dependencies);
        Ok(Self(context.clone()))
    }
}

impl Drop for Scope {
    fn drop(&mut self) {
        self.0.lock().unwrap().dependency_scopes.pop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundles_are_portable_replaceable_and_reject_corruption() -> Result<()> {
        let wasm = b"\0asm\x01\0\0\0";
        let dependencies = BTreeMap::from([("math".into(), wasm.to_vec())]);
        let bytes = embed(wasm, &dependencies)?;
        assert_eq!(read(&bytes)?, dependencies);
        assert_eq!(embed(&bytes, &dependencies)?, bytes);
        assert_eq!(embed(&bytes, &BTreeMap::new())?, wasm);
        assert!(read(&bytes[..bytes.len() - 1]).is_err());
        let context = crate::host::State::new(Default::default());
        {
            let _scope = Scope::enter(&context, &bytes)?;
            assert!(context
                .lock()
                .unwrap()
                .dependency_scopes
                .last()
                .unwrap()
                .contains_key("math"));
            {
                let _nested = Scope::enter(&context, wasm)?;
                assert!(context
                    .lock()
                    .unwrap()
                    .dependency_scopes
                    .last()
                    .unwrap()
                    .is_empty());
            }
            assert_eq!(context.lock().unwrap().dependency_scopes.len(), 1);
        }
        assert!(context.lock().unwrap().dependency_scopes.is_empty());
        Ok(())
    }
}
