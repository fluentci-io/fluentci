use std::collections::{BTreeSet, HashMap, VecDeque};

/// Validated dependency graph. Duplicate edges are coalesced.
#[derive(Debug)]
pub struct DependencyGraph {
    pub dependencies: Vec<Vec<usize>>,
    pub successors: Vec<Vec<usize>>,
    pub order: Vec<usize>,
}

impl DependencyGraph {
    pub fn new(ids: &[String], needs: &[Vec<String>]) -> Result<Self, String> {
        if ids.len() != needs.len() {
            return Err("dependency list length does not match node count".into());
        }
        let mut index = HashMap::new();
        for (i, id) in ids.iter().enumerate() {
            if id.is_empty() || index.insert(id.as_str(), i).is_some() {
                return Err(format!("empty or duplicate task ID: {id}"));
            }
        }
        let mut dependencies = vec![vec![]; ids.len()];
        let mut successors = vec![vec![]; ids.len()];
        for (i, parents) in needs.iter().enumerate() {
            let mut unique = BTreeSet::new();
            for parent in parents {
                let p = *index
                    .get(parent.as_str())
                    .ok_or_else(|| format!("task {} depends on missing task {parent}", ids[i]))?;
                unique.insert(p);
            }
            for p in unique {
                dependencies[i].push(p);
                successors[p].push(i);
            }
        }
        let mut remaining: Vec<_> = dependencies.iter().map(Vec::len).collect();
        let mut ready: VecDeque<_> = remaining
            .iter()
            .enumerate()
            .filter_map(|(i, &n)| (n == 0).then_some(i))
            .collect();
        let mut order = Vec::with_capacity(ids.len());
        while let Some(i) = ready.pop_front() {
            order.push(i);
            for &next in &successors[i] {
                remaining[next] -= 1;
                if remaining[next] == 0 {
                    ready.push_back(next);
                }
            }
        }
        if order.len() != ids.len() {
            return Err("dependency cycle detected".into());
        }
        Ok(Self {
            dependencies,
            successors,
            order,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn graph(ids: &[&str], needs: &[&[&str]]) -> Result<DependencyGraph, String> {
        DependencyGraph::new(
            &ids.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
            &needs
                .iter()
                .map(|n| n.iter().map(|s| s.to_string()).collect())
                .collect::<Vec<_>>(),
        )
    }
    #[test]
    fn diamond_waits_for_both_parents() {
        let g = graph(&["a", "b", "c", "d"], &[&[], &["a"], &["a"], &["b", "c"]]).unwrap();
        assert_eq!(g.order, vec![0, 1, 2, 3]);
    }
    #[test]
    fn invalid_graphs_fail_before_execution() {
        assert!(graph(&["a"], &[&["missing"]]).is_err());
        assert!(graph(&["a", "a"], &[&[], &[]]).is_err());
        assert!(graph(&["a", "b"], &[&["b"], &["a"]]).is_err());
        assert!(graph(&["a"], &[&["a"]]).is_err());
    }
    #[test]
    fn empty_and_duplicate_dependencies_are_supported() {
        assert!(graph(&[], &[]).unwrap().order.is_empty());
        let g = graph(&["a", "b"], &[&[], &["a", "a"]]).unwrap();
        assert_eq!(g.dependencies[1], vec![0]);
    }
}
