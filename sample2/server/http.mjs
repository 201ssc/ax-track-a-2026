import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chat} from './chat-service.mjs';
import {CommandError} from '../commands.mjs';

const files=new Set(['index.html','styles.css','boot.js','app.js','api.mjs','model.mjs','chat.mjs']);
const mime={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8'};
function fail(status,code,message) {throw new CommandError(code,message,status);}
function json(res,status,value) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
async function body(req) {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail(415,'invalid_content_type','JSON 형식이 필요해요.');
  const chunks=[];let length=0;
  for await(const chunk of req) {length+=chunk.length;if(length>1024*1024)fail(413,'body_too_large','요청이 너무 커요.');chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks).toString());} catch {fail(400,'invalid_json','요청 내용을 확인해 주세요.');}
}
export function createDiaryServer(store,{interpret=null}={}) {
  return createServer(async(req,res)=>{
    try {
      const address=`${req.socket.localAddress==='::1'?'[::1]':req.socket.localAddress}:${req.socket.localPort}`;
      const allowed=new Set([`127.0.0.1:${req.socket.localPort}`,`localhost:${req.socket.localPort}`,address]);
      if(!allowed.has(req.headers.host))fail(403,'invalid_host','허용된 로컬 주소로 접속해 주세요.');
      const origin=`http://${req.headers.host}`,url=new URL(req.url,origin),path=url.pathname;
      if(req.headers.origin&&req.headers.origin!==origin)fail(403,'invalid_origin','같은 주소에서 요청해 주세요.');
      if(req.headers['sec-fetch-site']==='cross-site')fail(403,'invalid_origin','같은 주소에서 요청해 주세요.');
      if(path==='/api/diary'&&req.method==='GET')return json(res,200,{...store.read(),chatMode:interpret?'gemini':'scripted'});
      if(path.startsWith('/api/')) {
        const match=path.match(/^\/api\/proposals\/([a-f0-9-]{36})(?:\/(confirm|cancel))?$/);
        if(match&&!match[2]&&req.method==='GET')return json(res,200,store.proposal(match[1]));
        if(req.method!=='POST')fail(405,'method_not_allowed','지원하지 않는 요청이에요.');
        const input=await body(req);
        if(path==='/api/commands')return json(res,200,store.execute(input));
        if(path==='/api/chat') {
          if(!input||typeof input.text!=='string'||!input.text.trim()||input.text.length>600||Object.keys(input).some(k=>k!=='text'))fail(422,'invalid_command','요청을 600자 이내로 적어주세요.');
          return json(res,200,await chat(store,input.text,interpret));
        }
        if(match&&match[2]) {
          if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)fail(422,'invalid_command','제안 ID만 확인할 수 있어요.');
          return json(res,200,store.decide(match[1],match[2]));
        }
        fail(404,'not_found','요청 경로를 찾을 수 없어요.');
      }
      if(!['GET','HEAD'].includes(req.method))fail(405,'method_not_allowed','지원하지 않는 요청이에요.');
      if(path==='/') {res.writeHead(302,{Location:'/sample2/'});return res.end();}
      const name=path==='/sample2/'?'index.html':path.startsWith('/sample2/')?path.slice(9):'';
      if(!files.has(name))fail(404,'not_found','파일을 찾을 수 없어요.');
      const data=await readFile(fileURLToPath(new URL(`../${name}`,import.meta.url)));
      res.writeHead(200,{'Content-Type':mime[name.split('.').at(-1)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:data);
    } catch(error) {
      json(res,error instanceof CommandError?error.status:503,{code:error instanceof CommandError?error.code:'storage_error',message:error instanceof CommandError?error.message:'처리하지 못했어요. 입력을 유지한 채 다시 시도해 주세요.'});
    }
  });
}
