const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):e.name.endsWith('.js')?[path.join(d,e.name)]:[]);
const files=[...walk(path.join(__dirname,'../src')),...walk(path.join(__dirname,'../test'))];
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status)process.exit(r.status)}
console.log(`Sintaxis válida en ${files.length} archivos.`);
