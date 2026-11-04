use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use fluentci::{
    db::Db,
    server::{self, AppState},
};
use tower::ServiceExt;
async fn setup() -> anyhow::Result<(tempfile::TempDir, Db)> {
    let temp = tempfile::tempdir()?;
    let db = Db::open(&temp.path().join("db")).await?;
    Ok((temp, db))
}
#[tokio::test]
async fn graphql_crud_uses_sqlite() -> anyhow::Result<()> {
    let (temp, db) = setup().await?;
    let schema = server::schema(AppState::new(db.clone()));
    let response = schema
        .execute("mutation { createProject { id name } }")
        .await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    let value = response.data.into_json()?;
    let id = value["createProject"]["id"].as_str().unwrap();
    assert!(db.project(id).await?.is_some());
    let mut project = db.project(id).await?.unwrap();
    project.path = temp.path().to_string_lossy().into();
    db.save_project(&project).await?;
    let query = async_graphql::Request::new("query($id: ID!) { project(id:$id) { id name } }")
        .variables(async_graphql::Variables::from_json(
            serde_json::json!({"id":id}),
        ));
    assert!(schema.execute(query).await.errors.is_empty());
    let response=schema.execute(format!(r#"mutation {{ saveActions(projectId:"{id}",actions:[{{name:"hello",commands:"bash 'echo hello'",enabled:true,plugin:"shell",useWasm:true}}]){{name}} }}"#)).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    assert_eq!(db.actions(id).await?.len(), 1);
    let response=schema.execute(format!(r#"mutation {{ runPipeline(projectId:"{id}",wait:true){{status jobs{{status logs{{message}}}}}} }}"#)).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    assert_eq!(
        response.data.into_json()?["runPipeline"]["status"],
        "SUCCESS"
    );
    let response = schema
        .execute(format!(r#"mutation {{ deleteProject(id:"{id}") }}"#))
        .await;
    assert!(response.errors.is_empty());
    assert!(db.actions(id).await?.is_empty());
    Ok(())
}
#[tokio::test]
async fn serves_embedded_ui_and_spa_routes() -> anyhow::Result<()> {
    let (_temp, db) = setup().await?;
    let router = server::router(AppState::new(db), true);
    for path in ["/", "/project/123", "/run/123", "/auth", "/settings"] {
        let response = router
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty())?)
            .await?;
        assert_eq!(response.status(), StatusCode::OK, "{path}");
        let body = to_bytes(response.into_body(), 10_000_000).await?;
        assert!(String::from_utf8_lossy(&body).contains("FluentCI Studio"));
    }
    let response = router
        .oneshot(
            Request::builder()
                .uri("/assets/missing.js")
                .body(Body::empty())?,
        )
        .await?;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    Ok(())
}
#[tokio::test]
async fn graphql_http_endpoint() -> anyhow::Result<()> {
    let (_temp, db) = setup().await?;
    let app = server::router(AppState::new(db), false);
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/graphql")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"query":"{ countProjects }"}"#))?,
        )
        .await?;
    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), 10000).await?;
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&body)?["data"]["countProjects"],
        0
    );
    Ok(())
}
