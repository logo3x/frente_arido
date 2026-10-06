'use strict';
// Control: muestra por qué la simulación evita funciones trascendentes.
// Compara 20.000 resultados de cada función entre V8 y QuickJS.
const { getQuickJS } = require('../servidor/node_modules/quickjs-emscripten');
const prog = `(function(){ let a=12345; const r=()=>(a=(a*48271)%2147483647)/2147483647; const o={sin:[],hypot:[],pow:[],exp:[],sqrt:[],mul_div:[]};
  for(let i=0;i<20000;i++){ const x=r()*200-100, y=r()*200-100; o.sin.push(Math.sin(x)); o.hypot.push(Math.hypot(x,y)); o.pow.push(Math.pow(Math.abs(x),1.7));
    o.exp.push(Math.exp(x/10)); o.sqrt.push(Math.sqrt(x*x+y*y)); o.mul_div.push((x*y)/(y+0.5)); } return JSON.stringify(o); })()`;
const v8 = JSON.parse(eval(prog));
getQuickJS().then(Q => {
  const c = Q.newContext(), r = c.evalCode(prog), q = JSON.parse(c.dump(r.value));
  console.log('Función      Diferencias V8/QuickJS (de 20.000)');
  for(const k of Object.keys(v8)){ const d = v8[k].filter((x,i) => x !== q[k][i]).length; console.log(`  ${k.padEnd(10)} ${String(d).padStart(6)}  ${d ? 'no apta para la simulación' : 'apta'}`); }
  process.exit(0);
});
