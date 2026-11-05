import fluentci_api/lexicon/models
import gleam/json

pub type Package =
  models.RegistryPackageView

pub type Page =
  models.RegistryListPackagesOutput

pub type Event {
  Upsert(package: Package, time_us: Int, event_id: String)
  Delete(uri: String, author: String, time_us: Int, event_id: String)
  Account(author: String, active: Bool, time_us: Int, event_id: String)
  Checkpoint(time_us: Int)
}

pub fn encode_package(package: Package) -> json.Json {
  models.encode_registry_package_view(package)
}

pub fn encode_page(page: Page) -> json.Json {
  models.encode_registry_list_packages_output(page)
}
