use std::{
    collections::{HashMap, VecDeque},
    ops::Index,
};

/// Compact, contiguous adjacency storage: O(nodes + edges), without per-node allocations.
#[derive(Clone, Debug)]
pub struct Edges {
    offsets: Vec<usize>,
    nodes: Vec<usize>,
}

impl Edges {
    pub(crate) fn empty(nodes: usize) -> Self {
        Self {
            offsets: vec![0; nodes + 1],
            nodes: vec![],
        }
    }
    pub(crate) fn from_lists(lists: Vec<Vec<usize>>) -> Self {
        let mut offsets = Vec::with_capacity(lists.len() + 1);
        let mut nodes = vec![];
        offsets.push(0);
        for list in lists {
            nodes.extend(list);
            offsets.push(nodes.len());
        }
        Self { offsets, nodes }
    }
    pub fn len(&self) -> usize {
        self.offsets.len().saturating_sub(1)
    }
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
    pub fn iter(&self) -> impl ExactSizeIterator<Item = &[usize]> + DoubleEndedIterator {
        (0..self.len()).map(move |i| &self[i])
    }
    pub fn storage_bytes(&self) -> usize {
        (self.offsets.len() + self.nodes.len()) * std::mem::size_of::<usize>()
    }
}

impl Index<usize> for Edges {
    type Output = [usize];
    fn index(&self, index: usize) -> &Self::Output {
        &self.nodes[self.offsets[index]..self.offsets[index + 1]]
    }
}

/// Validated dependency graph. String references are interned once into node indices.
#[derive(Clone, Debug)]
pub struct DependencyGraph {
    pub dependencies: Edges,
    pub successors: Edges,
    pub order: Vec<usize>,
}

impl DependencyGraph {
    pub fn new(ids: &[String], needs: &[Vec<String>]) -> Result<Self, String> {
        Self::build(
            &ids.iter().map(String::as_str).collect::<Vec<_>>(),
            &needs.iter().map(Vec::as_slice).collect::<Vec<_>>(),
        )
    }
    pub fn from_tasks(tasks: &[crate::Task]) -> Result<Self, String> {
        Self::build(
            &tasks
                .iter()
                .map(|task| task.id.as_str())
                .collect::<Vec<_>>(),
            &tasks
                .iter()
                .map(|task| task.needs.as_slice())
                .collect::<Vec<_>>(),
        )
    }
    fn build(ids: &[&str], needs: &[&[String]]) -> Result<Self, String> {
        if ids.len() != needs.len() {
            return Err("dependency list length does not match node count".into());
        }
        let mut index = HashMap::with_capacity(ids.len());
        for (i, id) in ids.iter().enumerate() {
            if id.is_empty() || index.insert(*id, i).is_some() {
                return Err(format!("empty or duplicate task ID: {id}"));
            }
        }
        let mut dependencies = Edges {
            offsets: Vec::with_capacity(ids.len() + 1),
            nodes: vec![],
        };
        dependencies.offsets.push(0);
        let mut counts = vec![0usize; ids.len()];
        let mut parents = vec![];
        for (i, needs) in needs.iter().enumerate() {
            parents.clear();
            for parent in *needs {
                parents.push(
                    *index.get(parent.as_str()).ok_or_else(|| {
                        format!("task {} depends on missing task {parent}", ids[i])
                    })?,
                );
            }
            parents.sort_unstable();
            parents.dedup();
            for &parent in &parents {
                counts[parent] += 1;
            }
            dependencies.nodes.extend_from_slice(&parents);
            dependencies.offsets.push(dependencies.nodes.len());
        }
        let mut offsets = Vec::with_capacity(ids.len() + 1);
        offsets.push(0);
        for count in &counts {
            offsets.push(offsets.last().copied().unwrap() + count);
        }
        let mut successors = Edges {
            offsets,
            nodes: vec![0; dependencies.nodes.len()],
        };
        let mut positions = successors.offsets[..ids.len()].to_vec();
        for (node, parents) in dependencies.iter().enumerate() {
            for &parent in parents {
                successors.nodes[positions[parent]] = node;
                positions[parent] += 1;
            }
        }
        let mut remaining = dependencies.iter().map(<[usize]>::len).collect::<Vec<_>>();
        let mut ready = remaining
            .iter()
            .enumerate()
            .filter_map(|(i, &count)| (count == 0).then_some(i))
            .collect::<VecDeque<_>>();
        let mut order = Vec::with_capacity(ids.len());
        while let Some(node) = ready.pop_front() {
            order.push(node);
            for &next in &successors[node] {
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

/// Incremental admission for ordinary success-dependent tasks. Each edge is visited once.
pub(crate) struct Frontier {
    remaining: Vec<usize>,
    completed: Vec<bool>,
    ranks: Vec<usize>,
    ready: std::collections::BTreeSet<(usize, usize)>,
    unfinished: usize,
}

impl Frontier {
    pub fn new(graph: &DependencyGraph) -> Self {
        let mut ranks = vec![0; graph.order.len()];
        for (rank, &node) in graph.order.iter().enumerate() {
            ranks[node] = rank;
        }
        let remaining = graph
            .dependencies
            .iter()
            .map(<[usize]>::len)
            .collect::<Vec<_>>();
        let ready = remaining
            .iter()
            .enumerate()
            .filter_map(|(node, &count)| (count == 0).then_some((ranks[node], node)))
            .collect();
        Self {
            completed: vec![false; remaining.len()],
            unfinished: remaining.len(),
            remaining,
            ranks,
            ready,
        }
    }
    pub fn next(&mut self) -> Option<usize> {
        self.ready.pop_first().map(|(_, node)| node)
    }
    pub fn complete(&mut self, node: usize, graph: &DependencyGraph) {
        if self.completed[node] {
            return;
        }
        self.completed[node] = true;
        self.unfinished -= 1;
        for &next in &graph.successors[node] {
            self.remaining[next] -= 1;
            if self.remaining[next] == 0 {
                self.ready.insert((self.ranks[next], next));
            }
        }
    }
    pub fn finished(&self) -> bool {
        self.unfinished == 0
    }
    pub fn rank(&self, node: usize) -> usize {
        self.ranks[node]
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

    #[test]
    fn hundred_thousand_node_chain_compiles_and_advances_iteratively() {
        let count = 100_000;
        let ids: Vec<_> = (0..count).map(|i| format!("task-{i}")).collect();
        let needs: Vec<_> = (0..count)
            .map(|i| {
                if i == 0 {
                    vec![]
                } else {
                    vec![ids[i - 1].clone()]
                }
            })
            .collect();
        let started = std::time::Instant::now();
        let graph = DependencyGraph::new(&ids, &needs).unwrap();
        assert_eq!(graph.order.len(), count);
        assert!(
            graph.dependencies.storage_bytes() + graph.successors.storage_bytes()
                <= 4 * count * std::mem::size_of::<usize>()
        );
        let mut ready = Frontier::new(&graph);
        for node in 0..count {
            assert_eq!(ready.next(), Some(node));
            assert_eq!(ready.next(), None);
            ready.complete(node, &graph);
            ready.complete(node, &graph);
        }
        assert!(ready.finished());
        eprintln!(
            "100000-node chain compiled and admitted in {:?}",
            started.elapsed()
        );
    }

    #[test]
    fn wide_join_is_admitted_only_after_every_parent() {
        let count = 10_000;
        let ids: Vec<_> = (0..=count).map(|i| format!("task-{i}")).collect();
        let mut needs = vec![vec![]; count + 1];
        needs[count] = ids[..count].to_vec();
        let graph = DependencyGraph::new(&ids, &needs).unwrap();
        let mut ready = Frontier::new(&graph);
        for node in 0..count {
            assert_eq!(ready.next(), Some(node));
            ready.complete(node, &graph);
        }
        assert_eq!(ready.next(), Some(count));
        ready.complete(count, &graph);
        assert!(ready.finished());
    }
}
