const {mkdtempSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
exports.startTestServer=async(seed,options={})=>{
 const {DiaryStore}=await import('../server/store.mjs');
 const {createDiaryServer}=await import('../server/http.mjs');
 const dir=mkdtempSync(join(tmpdir(),'diary-browser-')),path=join(dir,'diary.sqlite');
 let store=new DiaryStore(path,{create:true});store.initialize(seed);await store.prepareProposals();
 let server=createDiaryServer(store,options);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 let closed=false;
 const cleanup=()=>{if(closed)return;closed=true;server.closeAllConnections();server.close();store.close();rmSync(dir,{recursive:true,force:true});};
 process.once('exit',cleanup);
 return {base,path,get store(){return store;},restart:async()=>{const port=server.address().port;server.closeAllConnections();await new Promise(r=>server.close(r));store.close();store=new DiaryStore(path);server=createDiaryServer(store,options);await new Promise(r=>server.listen(port,'127.0.0.1',r));},close:async()=>cleanup(),read:async()=>{const r=await fetch(base+'/api/diary');return (await r.json()).state;}};
};
exports.settled=page=>page.waitForFunction(()=>document.body.dataset.saving!=='true');
