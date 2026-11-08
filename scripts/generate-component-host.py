#!/usr/bin/env python3
"""Generate the complete WIT host contract from the ABI schema and Rust model AST."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / 'engine' if (ROOT / 'engine/crates').is_dir() else ROOT
INSPECTION = ROOT/'templates/inspection' if (ROOT/'templates/inspection').is_dir() else ROOT/'sdk/inspection'
SCHEMA = ENGINE / 'schema'
HOST = json.loads((SCHEMA / 'host.json').read_text())
MODELS = json.loads((SCHEMA / 'executor-model.json').read_text())
RESERVED = set('type record resource variant enum flags use world interface import export func constructor static own borrow bool string char list option result tuple as from with future stream include package'.split())


def kebab(value):
    return re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', value).replace('_', '-').lower()


def ident(value):
    value = kebab(value)
    return '%' + value if value in RESERVED else value


names = {'executor::Status':'task-status','files::Operation':'file-operation','primitive::Operation':'primitive-operation','primitive::Input':'digest-input','primitive::Ssh':'ssh-connection','packages::Provider':'package-provider','packages::Install':'package-install','packages::Manager':'package-manager','service::Service':'service-config','workflow::Policy':'workflow-policy'}
for key, model in MODELS.items():
    names.setdefault(key, kebab(model['name']))
for name in HOST['components']['schemas']:
    names['legacy::'+name] = 'secret-provider' if name == 'Provider' else ('chmod-options' if name == 'Chmod' else kebab(name))+('-handle' if name in ['Devbox','Devenv','Envhub','Flox','Git','Hermit','Mise','Nix','Pipeline','Pixi','Pkgx','Proto','Service','Directory','File','Cache','Secret'] else '')
assert len(set(names.values())) == len(names), 'Duplicate WIT type names'

def scalar(name):
    return {'kind':'scalar','type':name}


def rust_type(value, module):
    if 'tuple' in value:
        return {'kind':'tuple','items':[rust_type(item,module) for item in value['tuple']]}
    path = value['path']; last = path.split('::')[-1]; args = value['arguments']
    if last in ['String','PathBuf']: return scalar('string')
    if last == 'Value' and 'serde_json' in path: return {'kind':'json'}
    if last == 'bool': return scalar('bool')
    if last in ['u8','u16','u32','u64']: return scalar(last)
    if last in ['usize','u128']: return scalar('u64')
    if last in ['i8','i16','i32','i64']: return scalar('s'+last[1:])
    if last == 'Option': return {'kind':'option','value':rust_type(args[0],module)}
    if last == 'Vec': return {'kind':'list','value':rust_type(args[0],module)}
    if last in ['BTreeMap','HashMap']:
        assert args[0]['path'] == 'String', 'Only string-keyed serialized maps are supported'
        return {'kind':'map','value':rust_type(args[1],module)}
    if '::' in path:
        mod = path.split('::')[-2]
        mod = 'primitive' if mod in ['remote','fluentci_primitives'] else mod
        key = mod+'::'+last
    else:
        key = module+'::'+last
        if key not in MODELS: key = 'executor::'+last
    assert key in names, f'Unknown model {path} in {module}'
    return {'kind':'ref','name':names[key]}


def legacy_type(value):
    if '$ref' in value: return {'kind':'ref','name':names['legacy::'+value['$ref'].split('/')[-1]]}
    if value['type'] == 'buffer': return {'kind':'list','value':{'kind':'tuple','items':[scalar('string'),scalar('string')]}}
    if value['type'] == 'array': return {'kind':'list','value':legacy_type(value['items'])}
    return scalar({'integer':'u32','boolean':'bool'}.get(value['type'], value['type']))


def wit_type(value):
    kind=value['kind']
    if kind=='scalar':return value['type']
    if kind=='json':return 'string'
    if kind=='ref':return ident(value['name'])
    if kind=='option':return 'option<'+wit_type(value['value'])+'>'
    if kind=='list':return 'list<'+wit_type(value['value'])+'>'
    if kind=='map':return 'list<tuple<string, '+wit_type(value['value'])+'>>'
    if kind=='tuple':return 'tuple<'+', '.join(wit_type(item) for item in value['items'])+'>'
    raise ValueError(value)


def fields(values, module, defaults=False):
    result=[]
    for field in values:
        ty=rust_type(field['type'],module)
        omit_null = (defaults or 'default' in field['serde']) and ty['kind']!='option'
        if omit_null:ty={'kind':'option','value':ty}
        result.append({'name':field['serde'].get('rename',field['name']),'wit':kebab(field['name']),'type':ty,'omitNull':omit_null})
    return result


def rename(name, rule):
    return kebab(name).replace('-','_') if rule=='snake_case' else name.lower() if rule=='lowercase' else name


models={}
for key,model in MODELS.items():
    name=names[key]; shape=model['shape']; serde=model['serde']
    if 'record' in shape:
        models[name]={'kind':'record','fields':fields(shape['record'],model['module'],'default' in serde)}
    elif 'variants' in shape:
        cases=[]
        for variant in shape['variants']:
            variant_name=variant['serde'].get('rename',rename(variant['name'],serde.get('rename_all')))
            case={'name':variant_name,'wit':kebab(variant['name'])}
            shape=variant['shape']
            if 'record' in shape:
                payload=name+'-'+kebab(variant['name'])
                models[payload]={'kind':'record','fields':fields(shape['record'],model['module'])}
                case['type']={'kind':'ref','name':payload}
            elif 'tuple' in shape:
                assert len(shape['tuple'])==1,'Multi-field tuple variants need an explicit record'
                case['type']=rust_type(shape['tuple'][0],model['module'])
            cases.append(case)
        models[name]={'kind':'variant','cases':cases,'tag':serde.get('tag'),'content':serde.get('content')}
    else:raise ValueError(shape)

for name, model in HOST['components']['schemas'].items():
    wid=names['legacy::'+name]
    if name=='Provider':
        models[wid]={'kind':'variant','tag':None,'content':None,'cases':[{'name':key,'wit':kebab(key),'type':legacy_type(value)} for key,value in model['properties'].items()]}
    else:
        models[wid]={'kind':'record','fields':[{'name':key,'wit':kebab(key),'type':({'kind':'option','value':legacy_type(value)} if value.get('nullable') or key not in model.get('required',[]) else legacy_type(value))} for key,value in model['properties'].items()]}

operations={}
for name, operation in HOST['imports'].items():
    operations[name]={'wit':kebab(name),'input':legacy_type(operation['input']) if 'input' in operation else None,'output':legacy_type(operation['output']) if 'output' in operation else None,'inputJson':operation.get('input',{}).get('contentType','').startswith(('application/json','application/x-binary')),'outputJson':operation.get('output',{}).get('contentType')=='application/json'}
operations['execute_plan']['input']={'kind':'ref','name':'plan'}
operations['execute_plan']['output']={'kind':'ref','name':'run-result'}

wit=['// Generated by scripts/generate-component-host.py. Do not edit.','package fluentci:runtime@0.1.0;','','/// Complete SDK host capabilities; all operations use native engine implementations.','interface api {']
for name, model in sorted(models.items()):
    if model['kind']=='record':
        wit+=['  record '+ident(name)+' {']+['    '+ident(field['wit'])+': '+wit_type(field['type'])+',' for field in model['fields']]+['  }']
    else:
        if all('type' not in case for case in model['cases']) and not model['tag']:
            wit+=['  enum '+ident(name)+' { '+', '.join(ident(case['wit']) for case in model['cases'])+' }']
        else:
            wit+=['  variant '+ident(name)+' {']+['    '+ident(case['wit'])+('('+wit_type(case['type'])+')' if 'type' in case else '')+',' for case in model['cases']]+['  }']
for name, operation in operations.items():
    parameters=('input: '+wit_type(operation['input'])) if operation['input'] else ''
    if name=='execute_plan':parameters='plan: plan, run-dir: string'
    result='result<'+(wit_type(operation['output']) if operation['output'] else '_')+', string>'
    wit.append('  '+ident(operation['wit'])+': func('+parameters+') -> '+result+';')
wit+=['}','', 'world sdk { import api; }','']

rust_abi = json.loads((SCHEMA / 'host-rust.json').read_text())
dispatch=['// Generated by scripts/generate-component-host.py. Do not edit.','pub fn invoke_value(context: &Context, name: &str, input: serde_json::Value) -> Result<serde_json::Value, Error> {','match name {']
for name, definition in rust_abi.items():
    arg=definition['argument'];ret=definition['result']
    value='Json(serde_json::from_value(input)?)' if arg and arg.startswith('Json<') else 'input.as_str().context("Expected a string input")?.to_owned()'
    call=f'{name}(context'+(', '+value if arg else '')+')?'
    dispatch.append('"'+name+'" => '+('Ok({ '+call+'; serde_json::Value::Null })' if ret=='()' else 'Ok(serde_json::to_value('+call+')?)')+',')
dispatch+=['name => anyhow::bail!("Unknown FluentCI host operation {name}"),','}','}','']
model_json=json.dumps({'models':models,'operations':operations},indent=2)+'\n'
legacy_wit=(ENGINE/'crates/components/wit/runtime.wit').read_text().split('// Generated full SDK capabilities.')[0].rstrip()
full_wit=legacy_wit+'\n\n// Generated full SDK capabilities.\n'+'\n'.join(wit[3:])
outputs={ENGINE/'crates/components/wit/runtime.wit':full_wit,INSPECTION/'component-host-schema.json':model_json,ENGINE/'crates/components/model.json':model_json,ENGINE/'crates/common/src/host_dispatch.rs':'\n'.join(dispatch)}
# The component Rust SDK reuses the same public PDK implementations, replacing
# only their transport imports. A check detects drift when source SDKs change.
portable = INSPECTION/'component-rust'
assert set(rust_abi)==set(HOST['imports']), 'Regenerate Rust ABI inventory for new host operations'
for path in (ENGINE/'crates/pdk/src').rglob('*.rs'):
    relative=path.relative_to(ENGINE/'crates/pdk/src')
    if relative.parts[0]=='generated':continue
    content=path.read_text().replace('use extism_pdk::*;', 'use crate::component::*;').replace('use extism_pdk::{host_fn, Error, Json};', 'use crate::component::{Error, Json};')
    if relative.name=='lib.rs': content='pub mod component;\n'+content
    outputs[portable/'src'/relative]=content
for module, names in json.loads((SCHEMA/'pdk-modules.json').read_text()).items():
    functions=['// Generated native component transport; no Extism host imports.']
    for name in names:
        definition=rust_abi[name];arg=definition['argument'];ret=definition['result']
        if module=='secret_manager' and name=='get_secret': ret='Json<Vec<types::Secret>>'
        argument='input: '+arg if arg else ''
        value='serde_json::to_value(input)?' if arg else 'serde_json::Value::Null'
        result='crate::component::invoke("'+name+'", '+value+')?'
        if ret=='()':body=result+'; Ok(())'
        else:body='Ok(serde_json::from_value('+result+')?)'
        functions.append('#[allow(dead_code)]\nunsafe fn '+name+'('+argument+') -> Result<'+ret+',Error> { '+body+' }')
    outputs[portable/'src/generated'/(module+'_imports.rs')]='\n'.join(functions)+'\n'
def rust_wit(ty):
    kind=ty['kind']
    if kind=='scalar':return {'string':'String','bool':'bool','s8':'i8','s16':'i16','s32':'i32','s64':'i64'}.get(ty['type'],ty['type'])
    if kind=='json':return 'String'
    if kind=='ref':return 'api::'+''.join(part[:1].upper()+part[1:] for part in ty['name'].split('-'))
    if kind=='option':return 'Option<'+rust_wit(ty['value'])+'>'
    if kind=='list':return 'Vec<'+rust_wit(ty['value'])+'>'
    if kind=='map':return 'Vec<(String,'+rust_wit(ty['value'])+')>'
    if kind=='tuple':return '('+','.join(rust_wit(item) for item in ty['items'])+',)'
    raise ValueError(ty)
functions=['// Generated direct typed WIT calls.','fn dispatch(name:&str,input:Value)->Result<Value,Error> {','use bindings::fluentci::runtime::api;','let result=match name {']
for name, operation in operations.items():
    if name=='execute_plan':continue
    setup=('let input: '+rust_wit(operation['input'])+'=serde_json::from_value(input)?;') if operation['input'] else ''
    argument=('input' if name=='nix' else '&input') if operation['input'] else ''
    functions.append('"'+name+'" => { '+setup+'serde_json::to_value(api::'+name+'('+argument+').map_err(Error::msg)?)? },')
functions+=['_=>return Err(Error::msg("Unknown native host operation")),','};Ok(result)','}','']
outputs[portable/'src/component_dispatch.rs']='\n'.join(functions)
outputs[portable/'src/component.rs']=(INSPECTION/'component-host-rust.rs').read_text()
outputs[portable/'model.json']=model_json
outputs[portable/'wit/runtime.wit']=full_wit
outputs[portable/'Cargo.toml']='[package]\nname="fluentci-pdk"\nversion="0.2.6"\nedition="2021"\nlicense="MPL-2.0"\n\n[dependencies]\nanyhow="1"\nserde={version="1",features=["derive"]}\nserde_json="1"\nwit-bindgen="=0.57.1"\nfluentci-types={path="../component-types"}\nfluentci-primitives={path="../component-primitives"}\n\n[workspace]\n'
for crate in ['types','primitives']:
    source=ENGINE/'crates'/crate
    for path in [source/'Cargo.toml',*source.joinpath('src').rglob('*.rs')]:
        outputs[INSPECTION/('component-'+crate)/path.relative_to(source)]=path.read_text()
args=argparse.ArgumentParser();args.add_argument('--check',action='store_true');options=args.parse_args()
for path,content in outputs.items():
    if path.suffix == '.rs':
        try:
            formatted = subprocess.run(['rustfmt', '--edition', '2021', '--emit', 'stdout'], input=content, text=True, capture_output=True)
        except FileNotFoundError:
            sys.exit('rustfmt is required: run rustup component add rustfmt')
        if formatted.returncode:
            sys.exit(f'rustfmt failed for {path.relative_to(ROOT)}:\n{formatted.stderr}\nEnsure rustfmt is installed: rustup component add rustfmt')
        content = formatted.stdout
    if options.check:
        assert path.read_text()==content, f'Regenerate {path.relative_to(ROOT)}'
    else:
        path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content)
print(f'{"Checked" if options.check else "Generated"} {len(operations)} host operations and {len(models)} model types.')
