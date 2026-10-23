import {resolve} from 'node:path';
import {loadEnvironment,databasePath} from './config.mjs';
import {readFileSync} from 'node:fs';
import {DiaryStore} from './store.mjs';

const [action,pathArgument,target]=process.argv.slice(2);
loadEnvironment();
let store;
try {
  if(!['init','read','command','backup'].includes(action))throw Error('사용법: node sample2/server/cli.mjs init|read|command|backup [DB 경로] [백업 경로]');
  const path=pathArgument?resolve(pathArgument):databasePath();
  store=new DiaryStore(path,{create:action==='init'});
  let result;
  if(action==='init')result=store.initialize();
  if(action==='read')result=store.read();
  if(action==='command')result=store.execute(JSON.parse(readFileSync(0,'utf8')));
  if(action==='backup') {if(!target)throw Error('백업 경로를 지정해 주세요.');await store.backupTo(resolve(target));result={backupPath:resolve(target)};}
  console.log(JSON.stringify(result));
} catch(error) {console.error(JSON.stringify({code:error.code||'storage_error',message:error.message}));process.exitCode=1;}
finally {store?.close();}
