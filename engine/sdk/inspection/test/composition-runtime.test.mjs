import test from 'node:test';
import assert from 'node:assert/strict';
import * as flow from '../composition-runtime.mjs';
function hostFixture() {
  const calls=[],environment=new Map();
  const call=(name,input)=>{
    calls.push([name,input]);
    if(name==='has_env')return JSON.stringify(environment.has(input));
    if(name==='get_env')return environment.get(input)??'';
    if(name==='set_envs'){for(const [k,v]of JSON.parse(input))environment.set(k,v);return;}
    if(name==='remove_env'){environment.delete(input);return;}
    if(name==='pipeline')return '{"id":"fixture"}';
    if(name==='stdout')return 'native-result';
    return '';
  };
  return {call,calls,environment};
}
test('construction is pure and mixed SDK imports execute in exact order',()=>{
  const h=hostFixture(),events=[];
  let p=flow.pipeline('ci');
  p=flow.moduleStep(p,'setup-tool.setup',{},()=>{events.push('setup');return {version:'1'};});
  p=flow.moduleStep(p,'tool.build',value=>({version:value.version}),args=>{events.push('build:'+args.version);return {report:'build.json'};});
  p=flow.exec(p,['echo','literal;$(not-shell)']);
  p=flow.moduleStep(p,'tool.check',value=>({stdout:value}),args=>{events.push('check:'+args.stdout);return 'done';});
  assert.deepEqual(events,[]);assert.deepEqual(h.calls,[]);
  assert.equal(flow.run(p,h.call),'done');
  assert.deepEqual(events,['setup','build:1','check:native-result']);
  assert.deepEqual(JSON.parse(h.calls.find(([name])=>name==='with_exec')[1]),["'echo'","'literal;$(not-shell)'"]);
});
test('working directory and fresh run directories are inherited without overwriting explicit options',()=>{
  const h=hostFixture(),args=[];
  let p=flow.workdir(flow.pipeline('ci'),'/project');
  p=flow.moduleStep(p,'tool.build',{},a=>{args.push(a);return a;},{project:true,runDir:true});
  p=flow.moduleStep(p,'tool.check',{project:'/other',runDir:'explicit'},a=>{args.push(a);return a;},{project:true,runDir:true});
  flow.run(p,h.call);flow.run(p,h.call);
  assert.equal(args[0].project,'/project');assert.notEqual(args[0].runDir,args[2].runDir);
  assert.deepEqual(args[1],{project:'/other',runDir:'explicit'});
});
test('module and native failures stop subsequent steps and run registered cleanup',()=>{
  for(const nativeFailure of [false,true]){
    const h=hostFixture(),events=[];
    let p=flow.ensuring(flow.pipeline('ci'),()=>events.push('cleanup'));
    p=nativeFailure?flow.exec(p,['false']):flow.moduleStep(p,'tool.fail',{},()=>{throw Error('original');});
    p=flow.moduleStep(p,'tool.never',{},()=>events.push('unexpected'));
    assert.throws(()=>flow.run(p,(name,...args)=>{if(nativeFailure&&name==='stdout')throw Error('original');return h.call(name,...args);}),/original/);
    assert.deepEqual(events,['cleanup']);
  }
});
test('arguments are snapshotted and explicit environment overrides are restored',()=>{
  const h=hostFixture();h.environment.set('X','before');const args={files:'one,two'};
  let p=flow.env(flow.pipeline('ci'),'X','during');
  p=flow.moduleStep(p,'tool.read',args,value=>{assert.equal(h.environment.get('X'),'during');return value.files;});
  args.files='mutated';assert.equal(flow.run(p,h.call),'one,two');assert.equal(h.environment.get('X'),'before');
});
test('cleanup failure never masks the original error',()=>{
  let p=flow.ensuring(flow.pipeline('ci'),()=>{throw Error('cleanup');});
  p=flow.moduleStep(p,'tool.fail',{},()=>{throw Error('original');});
  assert.throws(()=>flow.run(p,()=>''),/original/);
});
test('cleanup declared at the end is registered even if an earlier step fails',()=>{
  const events=[];
  let p=flow.moduleStep(flow.pipeline('ci'),'tool.fail',{},()=>{throw Error('failed');});
  p=flow.ensuring(p,()=>events.push('cleanup'));
  assert.throws(()=>flow.run(p,()=>''),/failed/);assert.deepEqual(events,['cleanup']);
});
test('SDK option and record codecs preserve typed values',()=>{
  const shape={kind:'record',name:'config',fields:[{name:'build-dir',type:{kind:'option',item:{kind:'string'}}}]};
  assert.deepEqual(flow.toWire({buildDir:{value0:'build'}},shape,'purescript'),{buildDir:'build'});
  assert.deepEqual(flow.toWire({build_dir:{0:'build'}},shape,'gleam'),{buildDir:'build'});
  class Config{constructor(build_dir){this.build_dir=build_dir;}}
  class Some{constructor(value){this[0]=value;}}
  const result=flow.fromWire({buildDir:'build'},shape,'gleam',{Config,just:v=>new Some(v),nothing:null});
  assert.ok(result instanceof Config);assert.ok(result.build_dir instanceof Some);assert.equal(result.build_dir[0],'build');
});

test('builder chains preserve immutable branches and compose named module operations',()=>{
  const h=hostFixture(),events=[];
  const operation=(p,args)=>flow.moduleStep(p,'tool.build',args,a=>{
    events.push(a.label);return a.label;
  });
  const base=flow.pipeline('builder').workdir('/workspace');
  const built=base
    .ensuring(()=>events.push('cleanup'))
    .env('MODE','test')
    .pipe(operation,{label:'built'})
    .map(value=>value.toUpperCase())
    .pipe(operation,value=>({label:value}))
    .exec(['echo','done']);
  assert.equal(base.steps.length,1);
  assert.deepEqual(events,[]);
  assert.equal(flow.run(built,h.call),'native-result');
  assert.deepEqual(events,['built','BUILT','cleanup']);
  assert.equal(h.environment.has('MODE'),false);
  assert.equal(flow.pipeline('terminal').pipe(operation,{label:'result'}).run(),'result');
});
