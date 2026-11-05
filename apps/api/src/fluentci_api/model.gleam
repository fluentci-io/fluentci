import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}

pub type Package {
  Package(
    uri: String,
    cid: String,
    name: String,
    description: String,
    version: String,
    published_at: String,
    author: String,
    license: String,
    url: String,
    sha256: String,
    size: Int,
  )
}

pub type Page {
  Page(packages: List(Package), cursor: Option(String))
}

pub type Event {
  Upsert(package: Package, time_us: Int)
  Delete(uri: String, author: String, time_us: Int)
  Account(author: String, active: Bool, time_us: Int)
  Checkpoint(time_us: Int)
}

pub fn encode_package(p: Package) -> json.Json {
  json.object([
    #("uri", json.string(p.uri)),
    #("cid", json.string(p.cid)),
    #("name", json.string(p.name)),
    #("description", json.string(p.description)),
    #("version", json.string(p.version)),
    #("publishedAt", json.string(p.published_at)),
    #("author", json.string(p.author)),
    #("license", json.string(p.license)),
    #("url", json.string(p.url)),
    #("sha256", json.string(p.sha256)),
    #("size", json.int(p.size)),
  ])
}

pub fn encode_page(page: Page) -> json.Json {
  let fields = [#("packages", json.array(page.packages, encode_package))]
  json.object(case page.cursor {
    None -> fields
    Some(cursor) -> list.append(fields, [#("cursor", json.string(cursor))])
  })
}
