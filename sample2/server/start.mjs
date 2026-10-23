import {loadEnvironment,databasePath,geminiSettings} from './config.mjs';
import {createGeminiInterpreter} from './gemini.mjs';
import {DiaryStore} from './store.mjs';
import {createDiaryServer} from './http.mjs';

loadEnvironment();
const path=databasePath();
const port=Number(process.env.PORT||8787);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT 값을 확인해 주세요.');
const settings=geminiSettings();
const interpret=settings?createGeminiInterpreter(settings):null;
const store=new DiaryStore(path,{create:true});
try {
  store.initialize();await store.prepareProposals();
  const server=createDiaryServer(store,{interpret});
  server.on('error',error=>{console.error('서버를 시작하지 못했습니다:',error.message);store.close();process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`다이어리: http://localhost:${port}/sample2/\nDB: ${path}\n채팅: ${interpret?'Gemini 루틴 추가·삭제 + 기존 각본 기능':'규칙 기반 대역 (실제 AI 미연결)'}`));
  const stop=()=>server.close(()=>{store.close();process.exit(0);});
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
} catch(error) {store.close();throw error;}
