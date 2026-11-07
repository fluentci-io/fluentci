"""Compatibility adapters over generated, typed WIT imports; no Extism runtime."""
from __future__ import annotations
import json
import sys
import types
from pathlib import Path
from wit_world.imports import api

schema = json.loads(Path(__file__).with_name("component-host-schema.json").read_text())


def pascal(name):
    return "".join(part.capitalize() for part in name.split("-"))


def convert(ty, value, encode):
    kind = ty["kind"]
    if kind == "scalar":
        return value
    if kind == "json":
        return json.dumps(value) if encode else json.loads(value)
    if kind == "option":
        return None if value is None else convert(ty["value"], value, encode)
    if kind == "list":
        values = [convert(ty["value"], item, encode) for item in value]
        return bytes(values) if encode and ty["value"] == {"kind": "scalar", "type": "u8"} else values
    if kind == "tuple":
        return tuple(convert(ty, item, encode) for ty, item in zip(ty["items"], value))
    if kind == "map":
        return [(key, convert(ty["value"], item, True)) for key, item in value.items()] if encode else {key: convert(ty["value"], item, False) for key, item in value}
    if kind != "ref":
        raise ValueError("Unsupported component wire kind")
    name = ty["name"]
    model = schema["models"][name]
    if model["kind"] == "record":
        result = {}
        for field in model["fields"]:
            key = field["wit"].replace("-", "_")
            item = value.get(field["name"]) if encode else getattr(value, key)
            if not encode and item is None and field.get("omitNull", False):
                continue
            result[key if encode else field["name"]] = convert(field["type"], item, encode)
        return getattr(api, pascal(name))(**result) if encode else result
    unit = all("type" not in case for case in model["cases"])
    tag, content = model.get("tag"), model.get("content")
    if encode:
        if tag:
            label, payload = value[tag], value.get(content) if content else {key: item for key, item in value.items() if key != tag}
        elif unit:
            label, payload = value, None
        else:
            if len(value) != 1:
                raise ValueError("Expected one variant")
            label, payload = next(iter(value.items()))
        case = next(case for case in model["cases"] if case["name"] == label)
        if unit and not tag:
            return getattr(api, pascal(name))[case["wit"].replace("-", "_").upper()]
        constructor = getattr(api, pascal(name) + "_" + pascal(case["wit"]))
        return constructor(convert(case["type"], payload, True)) if "type" in case else constructor()
    if unit and not tag:
        return next(case["name"] for case in model["cases"] if case["wit"].replace("-", "_").upper() == value.name)
    case = next(case for case in model["cases"] if type(value).__name__ == pascal(name) + "_" + pascal(case["wit"]))
    payload = convert(case["type"], value.value, False) if "type" in case else None
    if tag:
        return {tag: case["name"], **({content: payload} if content else payload or {})}
    return {case["name"]: payload}


def invoke(name, text=""):
    operation = schema["operations"][name]
    function = getattr(api, name)
    if name == "execute_plan":
        request = json.loads(text)
        result = function(convert(operation["input"], request["plan"], True), request["run_dir"])
    else:
        value = json.loads(text) if operation["inputJson"] else text
        result = function(convert(operation["input"], value, True)) if operation["input"] else function()
    if not operation["output"]:
        return ""
    value = convert(operation["output"], result, False)
    return json.dumps(value) if operation["outputJson"] or name == "execute_plan" else value


def install():
    module = types.ModuleType("fluentci._imports")
    for name in schema["operations"]:
        setattr(module, name, lambda text="", name=name: invoke(name, text))
    sys.modules["fluentci._imports"] = module
