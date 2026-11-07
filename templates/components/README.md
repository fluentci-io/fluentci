# Component starter overlays

These files override the base SDK starters during `fluentci init` and
`fluentci modules add --runtime component`. They are not standalone SDK projects:
scaffolding also copies the base SDK, shared inspection helpers, and host WIT.
Use the CLI to create a complete starter, or apply an overlay to the matching
base starter with those dependencies present.
