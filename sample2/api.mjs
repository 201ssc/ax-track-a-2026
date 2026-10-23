export class DiaryApi {
  snapshot=null;pending=null;
  async request(path,body) {
    let response;
    try {response=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(40000),...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});}
    catch {throw Error('서버에 연결하지 못했어요. 입력을 유지한 채 다시 저장해 주세요.');}
    let data;
    try {data=await response.json();}catch {throw Error('저장 결과를 확인하지 못했어요. 같은 내용으로 다시 시도해 주세요.');}
    if(!response.ok) {const error=new Error(data.message);error.code=data.code;error.status=response.status;throw error;}
    return data;
  }
  async load() {this.snapshot=await this.request('/api/diary');return this.snapshot;}
  async command(type,payload) {
    const signature=JSON.stringify({type,payload});
    if(this.pending&&this.pending.signature!==signature)throw Error('이전 저장 결과를 확인하려면 같은 내용을 다시 저장해 주세요. 다른 작업은 그다음에 할 수 있어요.');
    this.pending??={signature,input:{requestId:crypto.randomUUID(),expectedRevision:this.snapshot.revision,type,payload}};
    try {
      const result=await this.request('/api/commands',this.pending.input);
      await this.load();this.pending=null;return result;
    } catch(error) {
      if(error.status&&error.status<500) {
        this.pending=null;
        if(error.code==='revision_conflict')await this.load();
      }
      throw error;
    }
  }
  chat(text) {if(this.pending)throw Error('먼저 실패한 저장을 같은 내용으로 다시 확인해 주세요.');return this.request('/api/chat',{text});}
  async decide(id,decision) {
    if(this.pending)throw Error('먼저 실패한 저장을 같은 내용으로 다시 확인해 주세요.');
    const result=await this.request(`/api/proposals/${id}/${decision}`,{});
    if(result.status==='applied')await this.load();
    return result;
  }
}
