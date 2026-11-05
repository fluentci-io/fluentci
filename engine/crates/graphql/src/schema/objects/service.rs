use async_graphql::{Object, ID};
use fluentci_types::service as types;

#[derive(Debug, Clone, Default)]
pub struct Service {
    pub id: ID,
}

impl From<types::Service> for Service {
    fn from(service: types::Service) -> Self {
        Self {
            id: service.id.into(),
        }
    }
}

#[Object]
impl Service {
    async fn id(&self) -> &ID {
        &self.id
    }
}
