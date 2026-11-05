//! Compiled by compare.py in an isolated workspace with before/after dependencies.
use serde_json::{json, Value};
use std::{hint::black_box, path::Path, time::Instant};

fn summary(samples: Vec<f64>) -> Value {
    let mut ordered = samples.clone();
    ordered.sort_by(f64::total_cmp);
    json!({"median_ms": ordered[ordered.len() / 2], "min_ms": ordered[0], "max_ms": ordered[ordered.len()-1], "samples_ms": samples})
}

fn needs(shape: &str, count: usize) -> Vec<Vec<String>> {
    (0..count)
        .map(|i| match shape {
            "chain" if i > 0 => vec![format!("task-{}", i - 1)],
            "join" if i == count - 1 => (0..count - 1).map(|p| format!("task-{p}")).collect(),
            "layers" if i >= 16 => (i / 16 * 16 - 16..i / 16 * 16)
                .map(|p| format!("task-{p}"))
                .collect(),
            _ => vec![],
        })
        .collect()
}

fn graph_benchmark(shape: &str, count: usize, rounds: usize) -> Value {
    let ids: Vec<_> = (0..count).map(|i| format!("task-{i}")).collect();
    let edges = needs(shape, count);
    let mut old = vec![];
    let mut new = vec![];
    for round in 0..=rounds {
        // Alternate order. Inputs and outputs are outside timed graph lifetimes;
        // construction is timed, destruction is not.
        for variant in if round % 2 == 0 { [0, 1] } else { [1, 0] } {
            let started = Instant::now();
            if variant == 0 {
                let graph = before::graph::DependencyGraph::new(black_box(&ids), black_box(&edges))
                    .unwrap();
                let elapsed = started.elapsed().as_secs_f64() * 1000.0;
                assert_eq!(black_box(&graph.order).len(), count);
                if round > 0 {
                    old.push(elapsed);
                }
            } else {
                let graph =
                    after::graph::DependencyGraph::new(black_box(&ids), black_box(&edges)).unwrap();
                let elapsed = started.elapsed().as_secs_f64() * 1000.0;
                assert_eq!(black_box(&graph.order).len(), count);
                if round > 0 {
                    new.push(elapsed);
                }
            }
        }
    }
    let before = summary(old);
    let after = summary(new);
    let speedup = before["median_ms"].as_f64().unwrap() / after["median_ms"].as_f64().unwrap();
    let g = after::graph::DependencyGraph::new(&ids, &edges).unwrap();
    let edge_count: usize = edges.iter().map(Vec::len).sum();
    let old_layout = 2 * count * std::mem::size_of::<Vec<usize>>()
        + 2 * edge_count * std::mem::size_of::<usize>();
    json!({"shape": shape, "nodes": count, "edges": edge_count, "before": before, "after": after, "speedup": speedup,
        "before_adjacency_layout_bytes": old_layout, "after_adjacency_layout_bytes": g.dependencies.storage_bytes() + g.successors.storage_bytes()})
}

fn plan(shape: &str, count: usize, root: &Path, products: bool) -> Value {
    let dependencies = needs(shape, count);
    let program = if Path::new("/usr/bin/true").is_file() {
        "/usr/bin/true"
    } else {
        "/bin/true"
    };
    let tasks: Vec<_> = (0..count).map(|i| {
        let mut task = json!({"id": format!("task-{i}"), "program": program, "cwd": root, "needs": dependencies[i], "timeout_ms": 5000});
        if products { task["policy"] = json!({"outputs": {"value": "input.txt"}}); }
        task
    }).collect();
    json!({"version": 1, "tasks": tasks, "jobs": 16, "inherit_env": false})
}

fn execution_benchmark(shape: &str, count: usize, products: bool, rounds: usize) -> Value {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("input.txt"), "published output").unwrap();
    let data = plan(shape, count, root.path(), products);
    let before: before::Plan = serde_json::from_value(data.clone()).unwrap();
    let after: after::Plan = serde_json::from_value(data).unwrap();
    let compiled = after.clone().compile().unwrap();
    let mut samples = [vec![], vec![], vec![]];
    for round in 0..=rounds {
        for variant in if round % 2 == 0 { [0, 1, 2] } else { [2, 1, 0] } {
            let path = root.path().join(format!("{round}-{variant}"));
            let started = Instant::now();
            match variant {
                0 => {
                    let result = before
                        .execute(&path, &before::Cancellation::default())
                        .unwrap();
                    let elapsed = started.elapsed().as_secs_f64() * 1000.0;
                    assert!(result.success(), "{result:?}");
                    if products {
                        assert!(result
                            .tasks
                            .iter()
                            .all(|t| t.outputs["value"] == "published output"));
                    }
                    if round > 0 {
                        samples[variant].push(elapsed);
                    }
                }
                _ => {
                    let result = if variant == 1 {
                        after.execute(&path, &after::Cancellation::default())
                    } else {
                        compiled.execute(&path, &after::Cancellation::default())
                    }
                    .unwrap();
                    let elapsed = started.elapsed().as_secs_f64() * 1000.0;
                    assert!(result.success(), "{result:?}");
                    if products {
                        assert!(result
                            .tasks
                            .iter()
                            .all(|t| t.outputs["value"] == "published output"));
                    }
                    if round > 0 {
                        samples[variant].push(elapsed);
                    }
                }
            }
            std::fs::remove_dir_all(path).unwrap();
        }
    }
    let [old, new, reused] = samples.map(summary);
    let speedup = old["median_ms"].as_f64().unwrap() / new["median_ms"].as_f64().unwrap();
    json!({"shape": shape, "nodes": count, "products": products, "before": old, "after": new, "after_reused": reused, "speedup": speedup})
}

fn main() {
    let rounds = std::env::args().nth(1).unwrap().parse::<usize>().unwrap();
    let graph: Vec<_> = ["chain", "wide", "join", "layers"]
        .into_iter()
        .map(|shape| graph_benchmark(shape, 100_000, rounds))
        .collect();
    let execution = vec![
        execution_benchmark("chain", 64, false, rounds),
        execution_benchmark("wide", 256, false, rounds),
        execution_benchmark("layers", 256, false, rounds),
        execution_benchmark("wide", 256, true, rounds),
    ];
    println!(
        "{}",
        json!({"samples": rounds, "warmup_rounds": 1, "graph": graph, "execution": execution})
    );
}
