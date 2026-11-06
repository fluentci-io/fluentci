use anyhow::{Result, ensure};
use async_graphql::{InputObject, SimpleObject};
use serde::{Deserialize, Serialize};

/// Portable, inclusive glob filters. PR branches refer to the target branch.
#[derive(Debug, Clone, Default, Serialize, Deserialize, SimpleObject, InputObject)]
#[graphql(input_name = "WorkflowFilterInput")]
#[serde(deny_unknown_fields)]
pub struct WorkflowFilter {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub branches: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject, InputObject)]
#[graphql(input_name = "WorkflowEventsInput")]
#[serde(deny_unknown_fields)]
pub struct WorkflowEvents {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub push: Option<WorkflowFilter>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pull_request: Option<WorkflowFilter>,
    #[serde(default = "manual")]
    pub manual: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub schedule: Vec<String>,
}

fn manual() -> bool {
    true
}

impl Default for WorkflowEvents {
    fn default() -> Self {
        Self {
            push: Some(WorkflowFilter {
                branches: vec!["main".into()],
                ..Default::default()
            }),
            pull_request: None,
            manual: true,
            schedule: vec![],
        }
    }
}

impl WorkflowEvents {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.pull_request
                .as_ref()
                .is_none_or(|filter| filter.tags.is_empty()),
            "Pull-request events do not support tag filters"
        );
        for filter in self.push.iter().chain(self.pull_request.iter()) {
            for pattern in filter
                .branches
                .iter()
                .chain(&filter.tags)
                .chain(&filter.paths)
            {
                ensure!(
                    !pattern.is_empty()
                        && pattern.len() <= 256
                        && !pattern.chars().any(char::is_control)
                        && !pattern.starts_with('!')
                        && !pattern.contains(['[', ']', '{', '}', '+', '\\']),
                    "Event filters support inclusive glob patterns with *, ** and ? (up to 256 characters)"
                );
            }
        }
        ensure!(
            self.schedule.len() <= 20,
            "At most 20 schedules are supported"
        );
        for cron in &self.schedule {
            validate_cron(cron)?;
        }
        Ok(())
    }
}

fn validate_cron(cron: &str) -> Result<()> {
    let fields: Vec<_> = cron.split_whitespace().collect();
    ensure!(
        fields.len() == 5,
        "Schedules must use five-field UTC cron expressions"
    );
    for (field, (minimum, maximum)) in
        fields
            .iter()
            .zip([(0, 59), (0, 23), (1, 31), (1, 12), (0, 6)])
    {
        for item in field.split(',') {
            let (range, step) = item
                .split_once('/')
                .map_or((item, None), |(r, s)| (r, Some(s)));
            if let Some(step) = step {
                ensure!(
                    step.parse::<u32>().is_ok_and(|n| n > 0 && n <= maximum + 1),
                    "Invalid cron step"
                );
            }
            if range == "*" {
                continue;
            }
            let (start, end) = range.split_once('-').unwrap_or((range, range));
            let start: u32 = start
                .parse()
                .map_err(|_| anyhow::anyhow!("Cron fields must use numbers, *, comma, - or /"))?;
            let end: u32 = end
                .parse()
                .map_err(|_| anyhow::anyhow!("Invalid cron range"))?;
            ensure!(
                start >= minimum && start <= end && end <= maximum,
                "Cron field is out of range"
            );
        }
    }
    Ok(())
}
