// Generic Drizzle bridge. Tables and application queries are defined in Gleam.
import * as d from 'drizzle-orm';
import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
import {toList} from '../../gleam.mjs';
export const identity=value=>value;
export const nullValue=()=>null;
const definition=(name,kind,nullable=false,primary=false)=>({name,kind,nullable,primary});
export const textColumn=(name,nullable,primary)=>definition(name,'text',nullable,primary);
export const integerColumn=(name,nullable,primary)=>definition(name,'integer',nullable,primary);
export const booleanColumn=name=>definition(name,'boolean');
const tables=new Map();
export function table(name,definitions,indexes){
 const defs=definitions.toArray();const indexDefs=indexes.toArray();const signature=JSON.stringify([defs,indexDefs]);
 const existing=tables.get(name);
 if(existing){if(existing.signature!==signature)throw Error(`Conflicting table definitions: ${name}`);return existing.table;}
 const columns=Object.fromEntries(defs.map(def=>{
  let column=def.kind==='text'?text(def.name):integer(def.name,def.kind==='boolean'?{mode:'boolean'}:undefined);
  if(!def.nullable)column=column.notNull();if(def.primary)column=column.primaryKey();
  return [def.name,column];
 }));
 const value=sqliteTable(name,columns,table=>indexDefs.map(def=>(def.unique?uniqueIndex:index)(def.name).on(...def.columns.map(name=>table[name]))));tables.set(name,{signature,table:value});return value;
}
const indexDefinition=(name,columns,unique)=>({name,columns:columns.toArray(),unique});export {indexDefinition as index};
export const column=(table,name)=>{const value=d.getTableColumns(table)[name];if(!value)throw Error(`Unknown column ${name}`);return value;};
const from=table=>({kind:'select',table,joins:[]});export {from};
export const where=(query,where)=>({...query,where});
export const limit=(query,limit)=>({...query,limit});
export const join=(query,table,on,inner)=>({...query,joins:[...query.joins,{table,on,inner}]});
export const compare=(column,op,value)=>d[op](column,value);
export const eqColumns=d.eq;
export const isNull=d.isNull;
export const combine=(conditions,all)=>{const items=conditions.toArray();return items.length?(all?d.and:d.or)(...items):(all?d.sql`true`:d.sql`false`);};
export const matches=(table,query)=>d.sql`${table} MATCH ${query}`;
export const orderExpression=(column,descending)=>(descending?d.desc:d.asc)(column);
export const order=(query,orders)=>({...query,orders:orders.toArray()});
export const assignment=(column,value)=>({column,value});
const values=assignments=>Object.fromEntries(assignments.toArray().map(({column,value})=>[column.name,value]));
export const insert=(table,assignments)=>({kind:'insert',table,values:values(assignments)});
export const conflictNothing=query=>({...query,conflict:{nothing:true}});
export const conflictUpdate=(query,target,assignments,setWhere)=>({...query,conflict:{target,set:values(assignments),setWhere}});
export async function execute(connection,q){
 let query;
 if(q.kind==='select'){
  query=connection.db.select(d.getTableColumns(q.table)).from(q.table).$dynamic();
  for(const join of q.joins)query=query[join.inner?'innerJoin':'leftJoin'](join.table,join.on);
  if(q.where)query=query.where(q.where);
  if(q.orders)query=query.orderBy(...q.orders);
  if(q.limit!==undefined)query=query.limit(q.limit);
 }else{
  query=connection.db.insert(q.table).values(q.values);
  if(q.conflict?.nothing)query=query.onConflictDoNothing();
  else if(q.conflict)query=query.onConflictDoUpdate(q.conflict);
  query=query.returning();
 }
 return toList(await query);
}
export const transaction=(connection,run)=>connection.db.transaction(tx=>run({...connection,db:tx}));
