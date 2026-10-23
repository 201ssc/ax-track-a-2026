// Start as a classic script so dependency-loading failures can be shown on screen.
(() => {
 const version=new URL(document.currentScript.src).searchParams.get('v')||'local';
 import(`./app.js?v=${encodeURIComponent(version)}`).then(()=>{
  document.body.dataset.appReady='true';
 }).catch(error=>{
  console.error('Diary startup failed',error);
  const main=document.getElementById('main');
  if(!main)return;
  main.innerHTML='<section class="load-state" role="alert"><h2>화면을 불러오지 못했어요.</h2><p>잠시 후 다시 불러와 주세요. 저장한 기록은 지우지 않았어요.</p><button class="primary" id="retry-load">다시 불러오기</button></section>';
  document.getElementById('retry-load').addEventListener('click',()=>location.reload());
 });
})();
