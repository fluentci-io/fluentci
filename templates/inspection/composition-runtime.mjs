// Shared guest runtime for generated, typed pipeline bindings. No construction IO.
const append = (pipeline, step) => Object.freeze({...pipeline, steps:Object.freeze([...pipeline.steps,Object.freeze(step)])});
const clone = value => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(clone));
  if (value instanceof Uint8Array) return new Uint8Array(value);
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)])));
};
export const pipeline = name => { text(name); return Object.freeze({name,steps:Object.freeze([])}); };
export const workdir = (p,path) => {text(path);return append(p,{kind:'workdir',path});};
export const env = (p,key,value) => {text(key);text(value,true);if(key.includes('='))throw Error('Invalid environment key');return append(p,{kind:'env',key,value});};
export const exec = (p,argv) => {if(!Array.isArray(argv)||!argv.length)throw Error('exec requires literal argv');argv.forEach((v,i)=>text(v,i>0));return append(p,{kind:'exec',argv:clone(argv)});};
export const moduleStep = (p,operation,args,call,options={}) => {
  text(operation);if(typeof call!=='function')throw Error('Missing typed component import');
  return append(p,{kind:'module',operation,args:typeof args==='function'?args:clone(args),call,options:clone(options)});
};
export const map = (p,project) => {if(typeof project!=='function')throw Error('map requires a typed projection');return append(p,{kind:'map',project});};
export const ensuring = (p,cleanup) => {if(typeof cleanup!=='function')throw Error('cleanup requires a function');return append(p,{kind:'cleanup',cleanup});};
function text(value,empty=false) {if(typeof value!=='string'||(!empty&&!value.length)||value.includes('\0'))throw Error('Expected a NUL-free string');}
const quote = value => "'"+value.replaceAll("'","'\\''")+"'";
export function host(name,input='',output=true) {
  const fn=Host.getFunctions()[name];if(typeof fn!=='function')throw Error(`Missing FluentCI host primitive: ${name}`);
  const result=fn(Memory.fromString(input).offset);
  return output?Memory.find(result).readString():undefined;
}
let runNumber=0;
// Host access is injected in regression tests; generated callers use the guest PDK.
export function run(p,call=host) {
  if(!p||!Array.isArray(p.steps))throw Error('Expected a pipeline');
  const saved=new Map(),context={project:'.',environment:new Map()},cleanups=p.steps.filter(step=>step.kind==='cleanup').map(step=>step.cleanup);
  const runId=`${Date.now().toString(36)}-${(++runNumber).toString(36)}-${Math.random().toString(36).slice(2)}`;
  let value,primaryError;
  const setEnv=(key,data)=>{
    if(!saved.has(key))saved.set(key,{present:JSON.parse(call('has_env',key)),value:call('get_env',key)});
    call('set_envs',JSON.stringify([[key,data]]),false);context.environment.set(key,data);
  };
  const native=argv=>{
    call('set_runner','default',false);
    call('pipeline',p.name);
    call('with_workdir',context.project,false);
    if(context.environment.size)call('set_envs',JSON.stringify([...context.environment]),false);
    call('with_exec',JSON.stringify(argv.map(quote)),false);
    return call('stdout');
  };
  try {
    for(const [index,step] of p.steps.entries()) {
      switch(step.kind) {
        case 'workdir': context.project=step.path;break;
        case 'env': setEnv(step.key,step.value);break;
        case 'exec': value=native(step.argv);break;
        case 'map': value=step.project(value);break;
        case 'cleanup': break;
        case 'module': {
          let args=typeof step.args==='function'?step.args(value):step.args;
          // All module options remain named fields; missing optional fields stay missing.
          if(args&&typeof args==='object'&&!Array.isArray(args)) {
            args={...args};
            if(step.options.project&&args.project==null)args.project=context.project;
            if(step.options.runDir&&args.runDir==null)args.runDir=`.fluentci/runs/${runId}/${index}`;
          }
          value=step.call(args);
          if(step.options.setup&&Array.isArray(value?.environment))for(const entry of value.environment)setEnv(entry.name,entry.value);
          break;
        }
        default: throw Error(`Unknown pipeline step: ${step.kind}`);
      }
    }
  } catch(error) {primaryError=error;}
  finally {
    for(const cleanup of cleanups.reverse())try {cleanup(value);}catch(error){primaryError??=error;}
    for(const [key,previous] of [...saved].reverse())try {
      if(previous.present)call('set_envs',JSON.stringify([[key,previous.value]]),false);
      else call('remove_env',key,false);
    }catch(error){primaryError??=error;}
  }
  if(primaryError)throw primaryError;
  return value;
}

const camel = value => value.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
const snake = value => value.replaceAll('-','_');
export function toWire(value,type,sdk) {
  switch(type.kind) {
    case 'bigint': return BigInt(value);
    case 'option': {
      if(sdk==='purescript')return value&&Object.hasOwn(value,'value0')?toWire(value.value0,type.item,sdk):undefined;
      if(sdk==='gleam')return value&&Object.hasOwn(value,0)?toWire(value[0],type.item,sdk):undefined;
      return value==null?undefined:toWire(value,type.item,sdk);
    }
    case 'record': return Object.fromEntries(type.fields.map(field=>[camel(field.name),toWire(value[sdk==='gleam'?snake(field.name):camel(field.name)],field.type,sdk)]));
    case 'list': {
      const items=[];
      if(sdk==='gleam') {for(let node=value;node&&Object.hasOwn(node,'head');node=node.tail)items.push(node.head);}
      else items.push(...value);
      return items.map(item=>toWire(item,type.item,sdk));
    }
    default:return value;
  }
}
export function fromWire(value,type,sdk,constructors={}) {
  switch(type.kind) {
    case 'bigint': return sdk==='purescript'||sdk==='gleam'?value.toString():value;
    case 'option': return value==null?constructors.nothing:constructors.just(fromWire(value,type.item,sdk,constructors));
    case 'record': {
      const fields=type.fields.map(field=>fromWire(value[camel(field.name)],field.type,sdk,constructors));
      if(sdk==='gleam'){const name=type.name.split('-').map(part=>part[0].toUpperCase()+part.slice(1)).join('');return new constructors[name](...fields);}
      return Object.fromEntries(type.fields.map((field,index)=>[camel(field.name),fields[index]]));
    }
    case 'list': {const values=value.map(item=>fromWire(item,type.item,sdk,constructors));return sdk==='gleam'?constructors.list(values):values;}
    default:return value;
  }
}
