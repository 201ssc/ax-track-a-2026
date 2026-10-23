const {spawnSync}=require('node:child_process');
const {join}=require('node:path');
for(const name of ['startup','browser','messages','management','future-dates','chat','prototype','sync','gemini']){
 const result=spawnSync(process.execPath,[join(__dirname,`${name}.cjs`)],{stdio:'inherit',env:process.env});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
console.log('PASS: all 9 browser suites');
