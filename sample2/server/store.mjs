import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {applyCommand,validateRequest,CommandError} from '../commands.mjs';
import {validateState} from '../model.mjs';
import {createDemoState} from '../demo.mjs';
import {clock} from './clock.mjs';

function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
function storedState(raw) {
  const state=validateState(JSON.parse(raw));
  if(!state.dayTitles||!Array.isArray(state.schedules)||!state.messages) throw Error('저장된 계획 자료를 확인해 주세요.');
  return state;
}

export class DiaryStore {
  #db; #clock; #path;
  constructor(path,{create=false,now=clock}={}) {
    if(!create&&!existsSync(path))throw Error('DB가 없습니다. init 명령으로 먼저 준비해 주세요.');
    if(create)mkdirSync(dirname(path),{recursive:true});
    this.#clock=now;this.#path=path;
    this.#db=new DatabaseSync(path,{timeout:5000});
    try {
      this.#db.exec('PRAGMA foreign_keys=ON');
      const version=this.#db.prepare('PRAGMA user_version').get().user_version;
      if(version===0&&create) {
        this.#transaction(()=>{
          if(this.#db.prepare("SELECT name FROM sqlite_master WHERE type='table'").get())throw Error('알 수 없는 기존 DB를 초기화하지 않습니다.');
          this.#db.exec(`CREATE TABLE diaries (
            id TEXT PRIMARY KEY CHECK(id='personal'), revision INTEGER NOT NULL CHECK(revision>=0),
            state_json TEXT NOT NULL CHECK(json_valid(state_json)), updated_at TEXT NOT NULL);
            CREATE TABLE command_receipts (
            diary_id TEXT NOT NULL REFERENCES diaries(id), request_id TEXT NOT NULL,
            request_hash TEXT NOT NULL, reply_json TEXT NOT NULL CHECK(json_valid(reply_json)),
            PRIMARY KEY(diary_id,request_id));
            PRAGMA user_version=1;`);
        });
      } else if(![1,2].includes(version)) throw Error('지원하지 않는 DB 스키마 버전입니다.');
    } catch(error) {this.#db.close();throw error;}
  }
  #transaction(fn) {
    this.#db.exec('BEGIN IMMEDIATE');
    try {const result=fn();this.#db.exec('COMMIT');return result;}
    catch(error){this.#db.exec('ROLLBACK');throw error;}
  }
  initialize(seedFactory) {
    return this.#transaction(()=>{
      if(!this.#db.prepare('SELECT id FROM diaries WHERE id=?').get('personal')) {
        const now=this.#clock(),state=seedFactory?seedFactory(now.today):createDemoState(now.today);
        storedState(JSON.stringify(state));
        this.#db.prepare('INSERT INTO diaries VALUES (?,0,?,?)').run('personal',JSON.stringify(state),now.updatedAt);
      }
      return this.read();
    });
  }
  read() {
    const row=this.#db.prepare('SELECT * FROM diaries WHERE id=?').get('personal');
    if(!row)throw Error('다이어리가 준비되지 않았습니다. init 명령을 실행해 주세요.');
    const {today,timeZone}=this.#clock();
    return {state:storedState(row.state_json),revision:row.revision,today,timeZone,updatedAt:row.updated_at};
  }
  execute(request) { return this.#transaction(()=>this.#execute(request)); }
  #execute(request) {
    // Only JSON data can cross the boundary, including when used directly without HTTP.
    const serialized=JSON.stringify(request);
    const input=JSON.parse(serialized);validateRequest(input);
    const hash=createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
    {
      const receipt=this.#db.prepare('SELECT * FROM command_receipts WHERE diary_id=? AND request_id=?').get('personal',input.requestId);
      if(receipt) {
        if(receipt.request_hash!==hash)throw new CommandError('request_id_reused','다른 내용에 같은 요청 ID를 사용할 수 없어요.',409);
        return JSON.parse(receipt.reply_json);
      }
      const current=this.read();
      if(current.revision!==input.expectedRevision)throw new CommandError('revision_conflict','다른 수정이 있습니다. 최신 자료를 읽고 다시 확인해 주세요.',409);
      let changed;
      try {changed=applyCommand(current.state,input.type,input.payload,current);}
      catch(error) {if(error instanceof CommandError)throw error;throw new CommandError('invalid_command',error.message);}
      const raw=JSON.stringify(changed.state);storedState(raw);
      const revision=current.revision+1;
      this.#db.prepare('UPDATE diaries SET state_json=?, revision=?, updated_at=? WHERE id=?').run(raw,revision,this.#clock().updatedAt,'personal');
      const reply={requestId:input.requestId,revision,result:changed.result};
      this.#db.prepare('INSERT INTO command_receipts VALUES (?,?,?,?)').run('personal',input.requestId,hash,JSON.stringify(reply));
      return reply;
    }
  }
  async prepareProposals() {
    if(this.#db.prepare('PRAGMA user_version').get().user_version===2)return;
    await this.backupTo(`${this.#path}.before-v2-${randomUUID()}.sqlite`);
    this.#transaction(()=>{
      if(this.#db.prepare('PRAGMA user_version').get().user_version===2)return;
      this.#db.exec(`CREATE TABLE proposals (
        id TEXT PRIMARY KEY, revision INTEGER NOT NULL, command_json TEXT NOT NULL,
        preview_json TEXT NOT NULL, status TEXT NOT NULL, expires_at TEXT NOT NULL,
        reply_json TEXT);
        PRAGMA user_version=2;`);
    });
  }
  propose(command,preview,revision) {
    return this.#transaction(()=>{
      const current=this.read();
      if(current.revision!==revision)throw new CommandError('revision_conflict','기록이 바뀌었어요. 다시 요청해 주세요.',409);
      applyCommand(current.state,command.type,command.payload,current);
      const id=randomUUID(),expiresAt=new Date(new Date(this.#clock().updatedAt).getTime()+86400000).toISOString();
      this.#db.prepare('INSERT INTO proposals VALUES (?,?,?,?,?,?,NULL)').run(id,revision,JSON.stringify(command),JSON.stringify(preview),'pending',expiresAt);
      return {proposalId:id,preview};
    });
  }
  proposal(id) {
    const row=this.#db.prepare('SELECT * FROM proposals WHERE id=?').get(id);
    if(!row)throw new CommandError('not_found','제안을 찾을 수 없어요.',404);
    return {id:row.id,status:row.status,preview:JSON.parse(row.preview_json),expiresAt:row.expires_at,
      result:row.reply_json?JSON.parse(row.reply_json):null};
  }
  decide(id,decision) {
    return this.#transaction(()=>{
      const proposal=this.proposal(id);
      if(proposal.status!=='pending')return proposal;
      if(proposal.expiresAt<=this.#clock().updatedAt) {
        this.#db.prepare("UPDATE proposals SET status='expired' WHERE id=?").run(id);
      } else if(decision==='cancel') {
        this.#db.prepare("UPDATE proposals SET status='cancelled' WHERE id=?").run(id);
      } else if(decision==='confirm') {
        const row=this.#db.prepare('SELECT * FROM proposals WHERE id=?').get(id);
        const reply=this.#execute({requestId:`proposal:${id}`,expectedRevision:row.revision,...JSON.parse(row.command_json)});
        this.#db.prepare("UPDATE proposals SET status='applied',reply_json=? WHERE id=?").run(JSON.stringify(reply),id);
      } else throw new CommandError('invalid_command','확인 또는 취소가 필요해요.');
      return this.proposal(id);
    });
  }
  async backupTo(path) {
    if(existsSync(path))throw Error('기존 백업 파일을 덮어쓰지 않습니다.');
    mkdirSync(dirname(path),{recursive:true});
    await backup(this.#db,path);
  }
  close() {this.#db.close();}
}
