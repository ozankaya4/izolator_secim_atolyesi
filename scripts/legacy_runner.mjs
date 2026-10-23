// Isolated read-only regression harness. The production app never executes legacy JS.
import fs from 'node:fs'
import vm from 'node:vm'
import {performance} from 'node:perf_hooks'
const raw=fs.readFileSync(new URL('../legacy-reference/worker-source.js',import.meta.url),'utf8')
const source=vm.runInNewContext(raw+';ISOLATION_WORKER_SOURCE',{}, {timeout:1000})
const context=vm.createContext({self:{},performance})
vm.runInContext(source,context,{timeout:5000})
const p=JSON.parse(fs.readFileSync(0,'utf8'))
context.input=p
const output=vm.runInContext(`(()=>{
 const p=input,s=p.system,st=p.structure;
 const controls={bodyMode:st.kind,structFn:st.frequency_hz,structZeta:st.damping,structMass:st.mass_percent,structGain:1,alpha:s.dynamic_static_ratio,acc:s.extra_acceleration_g,loadDirection:s.static_direction.join(','),compRate:p.shock.compensation_percent,direction:p.direction.join(',')};
 for(const [key,value]of Object.entries(controls))r$(key).value=value;
 r$('autoConnection').checked=st.automatic_connection;
 mounts=p.mounts.map(m=>({x:m.position_mm[0],y:m.position_mm[1],z:m.position_mm[2],roll:m.angles_deg[0],pitch:m.angles_deg[1],yaw:m.angles_deg[2],k1:m.stiffness_n_mm[0],k2:m.stiffness_n_mm[1],k3:m.stiffness_n_mm[2],model:m.source==='user'?'Kullanıcı':m.product_id}));
 const point=st.automatic_connection?[0,1,2].map(j=>mounts.reduce((a,m)=>a+m[['x','y','z'][j]],0)/mounts.length):st.connection_mm;
 const ref=point.map((v,i)=>(v-s.cg_mm[i])/1000),norm=Math.hypot(...p.direction),dir=p.direction.map(v=>v/norm);
 const start=performance.now(),sys=assemble(mounts,s.cg_mm,s.mass_kg,s.inertia_kg_m2),h=transferPack(sys,dir,p.harmonic.frequency_hz,s.damping,ref),random=randomSolve(sys,dir,s.damping,ref,p.random.points.map(q=>[q.frequency_hz,q.density_g2_hz])),sh=shock6(sys,dir,s.damping,ref,p.shock.amplitude_g,p.shock.duration_ms/1000,p.shock.shape);
 harmonicPlot(sys,dir,s.damping,ref,p.harmonic.frequency_hz);
 const stat=staticSolve(sys,s.dynamic_static_ratio,s.mass_kg,s.static_direction,s.extra_acceleration_g);
 return {duration_ms:performance.now()-start,modes:(st.kind==='flexible'?coupledModel(sys,dir,s.damping,ref).modes:sys.modes).map(m=>m.fn),static:stat,harmonic:{connection:h.resp.mag.map(x=>x*p.harmonic.amplitude_g),T:h.resp.T,sensor:h.sensor.mag.map(x=>x*p.harmonic.amplitude_g)},psd:{connection:random.cg,sensor:random.sensor,local:random.local},shock:{connection:sh.cg,local:sh.local,sensor:sh.sensor,steps:sh.steps}};
})()`,context,{timeout:120000})
process.stdout.write(JSON.stringify(output))
