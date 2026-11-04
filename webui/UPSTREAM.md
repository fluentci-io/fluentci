# Imported Studio source

Source: https://github.com/fluentci-io/fluentci-studio
Commit: 6d34f3fe940709d36bb7767b6d705df2f00ca794

This web application is built with Vite and embedded directly into FluentCI.
The former Actix and Electron wrappers are replaced by the CLI's Axum server.
There is no desktop bootstrap that installs or invokes a Deno CLI. Local authentication
uses an offline adapter, and HTTP/WebSocket requests use the serving origin.
The source's MPL license is retained in LICENSE.
