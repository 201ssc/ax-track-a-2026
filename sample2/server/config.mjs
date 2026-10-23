import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';

export function loadEnvironment() {
  const env=fileURLToPath(new URL('../.env',import.meta.url));
  if(existsSync(env))process.loadEnvFile(env);
}
export function databasePath() {
  return resolve(process.env.DIARY_DB_PATH||join(process.env.XDG_DATA_HOME||join(homedir(),'.local','share'),'iruo-habit-diary','diary.sqlite'));
}

export function geminiSettings(env=process.env) {
  const apiKey=(env.GEMINI_API_KEY||'').trim(),configured=(env.AGENT_MODEL||'').trim();
  if(!apiKey&&!configured)return null;
  if(!apiKey)throw Error('GEMINI_API_KEY를 .env에 설정해 주세요.');
  if(!/^gemini\/[a-z0-9][a-z0-9.-]*$/.test(configured))throw Error('AGENT_MODEL을 gemini/모델ID 형식으로 설정해 주세요.');
  const timeoutSeconds=Number(env.AGENT_TIMEOUT_SECONDS||10);
  if(!Number.isFinite(timeoutSeconds)||timeoutSeconds<1||timeoutSeconds>30)throw Error('AGENT_TIMEOUT_SECONDS는 1~30초로 설정해 주세요.');
  return {apiKey,model:configured.slice(7),timeoutSeconds};
}
