"""Immutable plugin primitives; .stdout()/.stderr() call FluentCI's exposed API."""
from .pipeline import File, Pipeline, Provider, Service, file, get_env, has_env, pipeline

__all__ = ["File", "Pipeline", "Provider", "Service", "file", "get_env", "has_env", "pipeline"]
