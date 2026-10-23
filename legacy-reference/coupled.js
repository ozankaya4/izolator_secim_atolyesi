'use strict';
const oldStructureOptions=structureOptions;
structureOptions=function(){let o=oldStructureOptions(),percent=+r$('structMass').value;if(o.flexible&&(!Number.isFinite(percent)||percent<.01||percent>99))throw Error('Etkin esnek kütle oranını %0.01–99 aralığında girin.');return {...o,gain:1,massPercent:percent}};
const cadd=(a,b)=>[a[0]+b[0],a[1]+b[1]],cscale=(a,b)=>[a[0]*b,a[1]*b],cmul=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]],cdiv=(a,b)=>complexDivide(...a,...b);
let coupledCache=null;
function coupledModel(sys,dir,zeta,point){
 const o=structureOptions(),key=JSON.stringify([dir,zeta,point,o.fn,o.zeta,o.massPercent]);if(coupledCache?.sys===sys&&coupledCache.key===key)return coupledCache;
 const me=sys.M[0]*o.massPercent/100,root=Math.sqrt(me),B=Bmat(point),b=sys.modes.map(md=>dot(mv(B,md.phi),dir)),h=b.map(x=>root*x),schur=1-dot(h,h);
 if(schur<1e-6)throw Error('Etkin kütle, referans noktası ve ataletler uyumsuz: kalan gövde kütle matrisi pozitif değil. Kütle oranını veya nokta/atalet tanımını düzeltin.');
 const w=2*Math.PI*o.fn,k=[...sys.modes.map(m=>m.lambda),w*w],c=[...sys.modes.map(m=>2*zeta*Math.sqrt(m.lambda)),2*o.zeta*w],g=[...sys.modes.map(md=>dot(md.phi,sys.M.map((x,i)=>x*([...dir,0,0,0][i])))),root];
 // Normalized modal coordinates [eta_1..eta_6, sqrt(me)*s].
 const mass=zeros(7);for(let i=0;i<7;i++)mass[i][i]=1;for(let i=0;i<6;i++)mass[i][6]=mass[6][i]=h[i];
 const L=zeros(7);for(let i=0;i<7;i++)for(let j=0;j<=i;j++){let v=mass[i][j];for(let t=0;t<j;t++)v-=L[i][t]*L[j][t];L[i][j]=i===j?Math.sqrt(v):v/L[j][j]}
 const inv=zeros(7);for(let j=0;j<7;j++)for(let i=0;i<7;i++){let v=i===j?1:0;for(let t=0;t<i;t++)v-=L[i][t]*inv[t][j];inv[i][j]=v/L[i][i]}
 const A=mul(mul(inv,k.map((v,i)=>k.map((_,j)=>i===j?v:0))),tr(inv));
 const modes=eigenSym(A).map(e=>{let phi=mv(tr(inv),e.v),lambda=e.lambda;return {fn:Math.sqrt(lambda)/(2*Math.PI),zeta:dot(phi,phi.map((x,i)=>x*c[i]))/(2*Math.sqrt(lambda))}});
 coupledCache={sys,key,me,root,B,h,schur,k,c,g,modes};return coupledCache;
}
function inverseCoupledMass(model,v){let s=(v[6]-dot(model.h,v.slice(0,6)))/model.schur;return [...v.slice(0,6).map((x,i)=>x-model.h[i]*s),s]}
const rigidTransfer=transferPack;
transferPack=function(sys,dir,f,zeta,point){
 if(!structureOptions().flexible)return rigidTransfer(sys,dir,f,zeta,point);
 const m=coupledModel(sys,dir,zeta,point),w=2*Math.PI*f,D=m.k.map((k,i)=>[k-w*w,w*m.c[i]]),cross=m.h.map(x=>-w*w*x);
 let numerator=[-m.g[6],0],den=D[6];for(let j=0;j<6;j++){numerator=cadd(numerator,cscale(cdiv([-m.g[j],0],D[j]),-cross[j]));den=cadd(den,cscale(cdiv([cross[j]*cross[j],0],D[j]),-1))}
 const t=cdiv(numerator,den),eta=cross.map((x,j)=>cdiv(cadd([-m.g[j],0],cscale(t,-x)),D[j]));let qr=Array(6).fill(0),qi=qr.slice();sys.modes.forEach((md,j)=>md.phi.forEach((x,i)=>{qr[i]+=x*eta[j][0];qi[i]+=x*eta[j][1]}));
 const connectionRe=mv(m.B,qr),connectionIm=mv(m.B,qi),sr=t[0]/m.root,si=t[1]/m.root;
 const response=(ur,ui)=>{let ar=ur.map((x,i)=>dir[i]-w*w*x),ai=ui.map(x=>-w*w*x);return{qr,qi,ar,ai,mag:ar.map((x,i)=>Math.hypot(x,ai[i])),T:Math.hypot(dot(ar,dir),dot(ai,dir))}};
 const resp=response(connectionRe,connectionIm),relativeRe=connectionRe.map((x,i)=>x+dir[i]*sr),relativeIm=connectionIm.map((x,i)=>x+dir[i]*si),sensor={...response(relativeRe,relativeIm),relativeRe,relativeIm,flexRe:sr,flexIm:si};
 return {resp,sensor,connectionRe,connectionIm,local:sys.data.map(d=>({re:mv(tr(d.R),mv(d.B,qr)),im:mv(tr(d.R),mv(d.B,qi))}))};
};
const rigidShock=shock6;
shock6=function(sys,dir,zeta,point,A,tau,shape,refine=1){
 if(!structureOptions().flexible)return rigidShock(sys,dir,zeta,point,A,tau,shape,refine);
 const m=coupledModel(sys,dir,zeta,point),min=m.modes[0].fn,max=m.modes[6].fn,tail=Math.max(10/min,...m.modes.map(x=>10/(x.zeta*2*Math.PI*x.fn))),end=tau+tail,steps=Math.ceil(end/(Math.min(tau/160,1/(100*max))/refine)),dt=end/steps;
 if(steps>300000)throw Error('Bağlı şok çözümü 300.000 adım sınırını aşıyor.');
 let state=Array(14).fill(0),cg=[0,0,0],sensor=[0,0,0],connectionRelative=[0,0,0],sensorRelative=[0,0,0],flexRelative=0,local=sys.data.map(()=>[0,0,0]),samples=[],stride=Math.max(1,Math.floor(steps/600));
 const pulse=t=>t<0||t>=tau?0:A*G*(shape==='half'?Math.sin(Math.PI*t/tau):shape==='saw'?t/tau:1-Math.abs(2*t/tau-1));
 function evaluate(t,s){const ab=pulse(t),acc=inverseCoupledMass(m,m.k.map((k,i)=>-k*s[i]-m.c[i]*s[7+i]-m.g[i]*ab));let q=Array(6).fill(0),qa=q.slice();sys.modes.forEach((md,j)=>md.phi.forEach((x,i)=>{q[i]+=x*s[j];qa[i]+=x*acc[j]}));const cr=mv(m.B,q),ca=mv(m.B,qa).map((x,i)=>x+dir[i]*ab),flex=s[6]/m.root;return{derivative:[...s.slice(7),...acc],q,cr,ca,flex,sr:cr.map((x,i)=>x+dir[i]*flex),sa:ca.map((x,i)=>x+dir[i]*acc[6]/m.root)}}
 for(let step=0;step<=steps;step++){let t=step*dt,r=evaluate(t,state);for(let i=0;i<3;i++){cg[i]=Math.max(cg[i],Math.abs(r.ca[i])/G);sensor[i]=Math.max(sensor[i],Math.abs(r.sa[i])/G);connectionRelative[i]=Math.max(connectionRelative[i],Math.abs(r.cr[i])*1000);sensorRelative[i]=Math.max(sensorRelative[i],Math.abs(r.sr[i])*1000)}flexRelative=Math.max(flexRelative,Math.abs(r.flex)*1000);sys.data.forEach((d,j)=>mv(tr(d.R),mv(d.B,r.q)).forEach((v,i)=>local[j][i]=Math.max(local[j][i],Math.abs(v)*1000)));if(step%stride===0||step===steps)samples.push([t,dot(r.ca,dir)/G,dot(r.sa,dir)/G]);if(step===steps)break;let k1=r.derivative,k2=evaluate(t+dt/2,state.map((x,i)=>x+dt*k1[i]/2)).derivative,k3=evaluate(t+dt/2,state.map((x,i)=>x+dt*k2[i]/2)).derivative,k4=evaluate(t+dt,state.map((x,i)=>x+dt*k3[i])).derivative;state=state.map((x,i)=>x+dt*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6)}
 return {cg,sensor,local,samples,dt,steps,end,connectionRelative,sensorRelative,flexRelative};
};
harmonicPlot=function(sys,dir,zeta,point,f){
 const flexible=structureOptions().flexible,modes=flexible?coupledModel(sys,dir,zeta,point).modes:sys.modes.map(m=>({...m,zeta})),linear=r$('plotScale').value==='linear',lo=linear?0:Math.max(.001,Math.min(f,...modes.map(m=>m.fn))/8),hi=Math.max(f*3,...modes.map(m=>m.fn*4)),set=new Set([lo,hi,f]);
 for(let i=0;i<650;i++)set.add(linear?hi*i/649:lo*Math.pow(hi/lo,i/649));for(let m of modes)for(let j=-100;j<=100;j++){let v=m.fn*(1+j*Math.min(zeta,structureOptions().zeta,m.zeta)/10);if(v>lo&&v<hi)set.add(v)}
 const data=[...set].sort((a,b)=>a-b).map(fr=>{let h=transferPack(sys,dir,fr,zeta,point);return [fr,h.resp.T,h.sensor.T]}),values=data.flatMap(p=>flexible?p.slice(1):[p[1]]),max=Math.max(1,...values),yhi=linear?max*1.1:Math.pow(10,Math.ceil(Math.log10(max*1.05))),ylo=linear?0:Math.pow(10,Math.floor(Math.log10(Math.max(1e-8,Math.min(...values))))),x=v=>65+690*(linear?(v-lo)/(hi-lo):Math.log(v/lo)/Math.log(hi/lo)),y=v=>225-190*(linear?v/yhi:Math.log(Math.max(v,ylo)/ylo)/Math.log(yhi/ylo));let svg='';
 const ticks=linear?Array.from({length:6},(_,i)=>yhi*i/5):Array.from({length:Math.round(Math.log10(yhi/ylo))+1},(_,i)=>ylo*10**i);for(let v of ticks)svg+=`<path d="M65 ${y(v)}H755" stroke="${v===1?'#7a8c80':'#dbe6dc'}"/><text x="3" y="${y(v)+4}" font-size="11">${linear?rf(v,3):v.toExponential(0)}</text>`;
 for(let j=0;j<6;j++){let v=linear?hi*j/5:lo*Math.pow(hi/lo,j/5);svg+=`<text x="${x(v)}" y="246" text-anchor="middle" font-size="11">${rf(v,2)} Hz</text>`}
 for(let j=1;j<=(flexible?2:1);j++)svg+=`<path d="${data.map((p,i)=>`${i?'L':'M'}${x(p[0])},${y(p[j])}`).join(' ')}" fill="none" stroke="${j===1?'#168664':'#bd8b30'}" stroke-width="2"/>`;
 svg+='<text x="65" y="17" font-size="12">T [oran] · Bağlantı (yeşil)'+(flexible?' · Sensör (altın)':'')+'</text>';globalThis.harmonicViewState={sys,dir,zeta,point,flexible,linear,lo,hi,ylo,yhi,data,options:{...structureOptions()}};r$('chart').innerHTML=svg;
};
const coupledRunBase=runAll;
runAll=function(){coupledCache=null;coupledRunBase();if(sixLast&&structureOptions().flexible){let {sys,dir,p}=sixLast,m=coupledModel(sys,dir,p.zeta,connectionPoint());r$('rigResult').innerHTML=r$('rigResult').innerHTML.replace('Ortak 6-DOF modal model','Rijit referansın 6 modu (bağlı frekanslar aşağıda)');r$('rigResult').insertAdjacentHTML('beforeend','<h3>Bağlı sistemin 7 doğal frekansı (sönümsüz)</h3><p>'+m.modes.map(x=>rf(x.fn,3)+' Hz').join(' · ')+'</p><p class="muted">Üstteki 6 mod rijit referans modelidir. Dinamik çıktılar bu 7 koordinatın bağlı çözümüdür. Etkin esnek kütle '+rf(m.me)+' kg; toplam kütlenin %'+rf(structureOptions().massPercent)+'. Yakın frekanslarda bağlaşım kuvveti kütle oranına ve modun referans noktasındaki yönsel hareketine bağlıdır.</p>')}};
runAll();
