import * as flow from 'fluentci:pipeline';
export const {pipeline,workdir,env,map,run}=flow;
export const ensuring=(p,cleanup)=>flow.ensuring(p,()=>cleanup());
export const exec=(p,program,args)=>{const argv=[program];for(let n=args;n&&Object.hasOwn(n,'head');n=n.tail)argv.push(n.head);return flow.exec(p,argv);};
