import * as flow from 'fluentci:pipeline';
export const pipeline = flow.pipeline;
export const workdir = path => p => flow.workdir(p,path);
export const env = key => value => p => flow.env(p,key,value);
export const exec = argv => p => flow.exec(p,argv);
export const map = f => p => flow.map(p,f);
export const ensuring = cleanup => p => flow.ensuring(p,()=>cleanup());
export const run = p => () => flow.run(p);
