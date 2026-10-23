'use strict';
// Shared structural UI and rigid fallback; coupled.js replaces flexible solvers.
const originalRunAll = runAll;
const originalValidate = validate;
const originalResultTable = resultTable;
const originalImportLayout = importLayout;
const originalInitDOM = r$('rigInputs');
r$('systemInputs').insertAdjacentHTML('afterend', `<section class="card" id="structurePanel" style="background:#eef5ee"><h3>İzole edilen yapının davranışı</h3><label>Yapı modeli<select id="bodyMode"><option value="rigid">Rijit yapı</option><option value="flexible">Esnek yapı · bağlı 6+1 DOF</option></select></label><div id="flexFields" class="grid"><label>Yapısal doğal frekans [Hz]<input id="structFn" type="number" value="250" min="0.1" max="100000" step="any"></label><label>Yapısal modal damping ζ [oran]<input id="structZeta" type="number" value="0.02" min="0.001" max="1" step="any"></label><label style="display:none">Eski modal katılım (kullanılmıyor)<input id="structGain" type="number" value="1" min="-20" max="20" step="any"></label><label>Etkin esnek kütle / toplam kütle [%]<input id="structMass" type="number" value="10" min="0.01" max="99" step="any"></label></div><p class="muted">Esnek durumda 6 rijit gövde + 1 bağıl esneme koordinatı karşılıklı bağlı çözülür. Varsayılan %10 etkin kütle varsayımdır; FEM/test veya eşdeğer kütle kalibrasyonu ile belirleyin. Girilen yapısal frekans, bağlantı sabitken esnek eşdeğer kütlenin frekansıdır. Toplam kütle ve CG ataletleri esnek kütleyi zaten içerir; ayrıca kütle eklenmez. Sensör, eşdeğer esnek kütlenin hareketini temsil eder (birim mod şekli).</p><label><input id="autoConnection" type="checkbox" checked> Sonuç noktası: izolatör bağlantı konumlarının geometrik ortalaması</label><p class="muted">Bağlantı bölgesinin aşağıda verilen tek referans noktasındaki hareketi raporlanır; bu, kütle merkezi veya en kötü izolatör hareketi değildir. Rijit seçilince sensör aynı noktayla özdeş kabul edilir ve tekrarlanan sensör sonuçları gizlenir.</p></section>`);
for (const [key, title] of [['sx','Bağlantı referansı X'],['sy','Bağlantı referansı Y'],['sz','Bağlantı referansı Z']]) {
  r$(key).parentElement.firstChild.textContent = `${title} [mm]`;
  rigDefs[key][0] = title;
}
function structureOptions(){
  const flexible=r$('bodyMode').value==='flexible';
  const fn=+r$('structFn').value,zeta=+r$('structZeta').value,gain=+r$('structGain').value;
  if(!flexible)return{flexible:false,fn:Number.isFinite(fn)&&fn>=.1&&fn<=100000?fn:250,zeta:Number.isFinite(zeta)&&zeta>=.001&&zeta<=1?zeta:.02,gain:r$('structGain').value!==''&&Number.isFinite(gain)&&Math.abs(gain)<=20?gain:1};
  if(flexible && (r$('structFn').value==='' || r$('structZeta').value==='' || r$('structGain').value==='' || !Number.isFinite(fn) || fn<.1 || fn>100000 || !Number.isFinite(zeta) || zeta<.001 || zeta>1 || !Number.isFinite(gain) || Math.abs(gain)>20))throw Error('Yapısal frekans, sönüm ve modal katılım girdilerini kontrol edin.');
  return {flexible,fn,zeta,gain};
}
function connectionPoint(){return ['sx','sy','sz'].map((k,i)=>(+r$(k).value-(+r$(['cx','cy','cz'][i]).value))/1000)}
function syncStructureUI(){
  const rigid=r$('bodyMode').value==='rigid';
  r$('flexFields').hidden=rigid;
  r$('flexFields').style.display=rigid?'none':'grid';
  for(const [j,k] of ['sx','sy','sz'].entries()){
    r$(k).disabled=r$('autoConnection').checked;
    if(r$('autoConnection').checked && mounts.length)r$(k).value=mounts.reduce((s,m)=>s+m[['x','y','z'][j]],0)/mounts.length;
  }
}
const infoPanel=document.createElement('section');
infoPanel.className='card';
infoPanel.innerHTML='<h2>Bağlı esnek model ve sınırlar</h2><p>6 rijit gövde koordinatı q ve tahrik yönündeki s bağıl esnemesi birlikte çözülür. b = dᵀB; M₇ = [[M₆, mₑ bᵀ], [mₑ b, mₑ]], K₇ = diag(K₆, mₑωₛ²). İzolasyon sönümü rijit gövde modal bazında; esnek eleman sönümü cₛ=2ζₛmₑωₛ. Tam sönüm matrisi korunur; bağlı modlar için tek ortak ζ atanmaz.</p><p>Bu, toplam rijit kütle/ataletten bağlantı referansındaki mₑ noktasal kütlenin ayrılıp yay-sönümle bağlandığı eşdeğer modeldir. Kalan gövdenin kütle matrisi pozitif olmalıdır; uygun olmayan etkin kütle/nokta/atalet birleşimi reddedilir. Gerçek FEM modunun genelleştirilmiş kütlesi tek başına bu eşdeğer kütleye doğrudan eşit değildir; mod şekli ve katılım ile kalibre edilmelidir.</p><p>Harmonik ve PSD kompleks bağlı çözümü; şok aynı bağlı kütle, katılık ve sönümle zaman çözümünü kullanır. Statik destek reaksiyonları toplam ağırlığa göre hesaplanır; yapısal statik esneme raporlanmaz. Rijit seçiminde sensör bağlantı noktasıyla özdeş kabul edilir.</p><p><a href="https://www.comsol.com/multiphysics/mode-superposition" target="_blank" rel="noopener">Modal denklemler ve sönüm varsayımları</a></p>';
r$('shockResult').closest('section').insertAdjacentElement('afterend',infoPanel);
// Update pre-existing chart help without changing the underlying mass model.
for(const p of document.querySelectorAll('p.muted'))if(p.textContent.startsWith('CG ve sensör için'))p.textContent='Bağlantı bölgesi ve (esnek seçimde) sensör için girdi doğrultusundaki çıkış/giriş oranı, dB. Negatif değer azaltım. Yerel yapısal mod çevresi de örneklenir.';
validate=function(){structureOptions();return originalValidate()};
function complexDivide(a,b,c,d){let den=c*c+d*d;return[(a*c+b*d)/den,(b*c-a*d)/den]}
function readoutResponse(connection,dir,f,options){
  let omega=2*Math.PI*f;
  let sr=0,si=0;
  if(options.flexible){let w=2*Math.PI*options.fn;[sr,si]=complexDivide(-options.gain*dot(connection.ar,dir),-options.gain*dot(connection.ai,dir),w*w-omega*omega,2*options.zeta*w*omega)}
  let ar=connection.ar.map((x,i)=>x-omega*omega*dir[i]*sr),ai=connection.ai.map((x,i)=>x-omega*omega*dir[i]*si);
  return{...connection,ar,ai,mag:ar.map((x,i)=>Math.hypot(x,ai[i])),T:Math.hypot(dot(ar,dir),dot(ai,dir)),flexRe:sr,flexIm:si};
}
transferPack=function(sys,dir,f,zeta,point){
  let resp=sixResponse(sys,dir,f,zeta,point),sensor=readoutResponse(resp,dir,f,structureOptions()),B=Bmat(point);
  let connectionRe=mv(B,resp.qr),connectionIm=mv(B,resp.qi);
  // Use the passed point rather than UI state, including in numerical tests.
  sensor.relativeRe=connectionRe.map((x,i)=>x+dir[i]*sensor.flexRe);
  sensor.relativeIm=connectionIm.map((x,i)=>x+dir[i]*sensor.flexIm);
  let local=sys.data.map(d=>({re:mv(tr(d.R),mv(d.B,resp.qr)),im:mv(tr(d.R),mv(d.B,resp.qi))}));
  return{resp,sensor,local,connectionRe,connectionIm};
};
randomSolve=function(sys,dir,zeta,point,pts,density=1){
  let options=structureOptions(),total=13+sys.data.length*3,variance=Array(total).fill(0),input=0;
  for(let j=1;j<pts.length;j++){
    let [f0,s0]=pts[j-1],[f1,s1]=pts[j],set=new Set([f0,f1]);
    let n=Math.ceil(Math.log(f1/f0)*600*density);for(let i=1;i<n;i++)set.add(f0*Math.pow(f1/f0,i/n));
    let modes=options.flexible?coupledModel(sys,dir,zeta,point).modes:sys.modes.map(m=>({fn:m.fn,zeta}));
    for(let md of modes){let bw=md.zeta*md.fn;for(let t=-100;t<=100;t++){let f=md.fn+bw*t/(5*density);if(f>f0&&f<f1)set.add(f)}}
    let freqs=[...set].sort((a,b)=>a-b),previous=null,pf=0;
    for(let f of freqs){
      let S=s0*Math.pow(f/f0,Math.log(s1/s0)/Math.log(f1/f0)),h=transferPack(sys,dir,f,zeta,point);
      const sq=(re,im)=>re.map((x,i)=>(x*x+im[i]*im[i])*G*G*S);
      let vals=[...h.resp.mag.map(x=>x*x*S),...h.sensor.mag.map(x=>x*x*S),...sq(h.connectionRe,h.connectionIm),...sq(h.sensor.relativeRe,h.sensor.relativeIm),(h.sensor.flexRe**2+h.sensor.flexIm**2)*G*G*S,...h.local.flatMap(r=>sq(r.re,r.im))];
      if(previous){let df=f-pf;input+=df*(S+previous.S)/2;variance=variance.map((x,i)=>x+df*(vals[i]+previous.vals[i])/2)}previous={S,vals};pf=f;
    }
  }
  let mm=v=>v.map(x=>Math.sqrt(x)*1000);
  return{input:Math.sqrt(input),cg:variance.slice(0,3).map(Math.sqrt),sensor:variance.slice(3,6).map(Math.sqrt),connectionRelative:mm(variance.slice(6,9)),sensorRelative:mm(variance.slice(9,12)),flexRelative:Math.sqrt(variance[12])*1000,local:sys.data.map((_,i)=>mm(variance.slice(13+3*i,16+3*i)))};
};
shock6=function(sys,dir,zeta,point,A,tau,shape,refine=1){
  const options=structureOptions(),flexible=options.flexible,ws=flexible?2*Math.PI*options.fn:0;
  const min=Math.min(sys.modes[0].fn,flexible?options.fn:Infinity),max=Math.max(sys.modes[5].fn,flexible?options.fn:0);
  const tail=Math.max(10/min,10/(zeta*2*Math.PI*sys.modes[0].fn),flexible?10/(options.zeta*ws):0),end=tau+tail;
  const maxDt=Math.min(tau/160,1/(max*100))/refine,steps=Math.ceil(end/maxDt),dt=end/steps;
  if(steps>300000)throw Error('Şok çözümü 300.000 adım sınırını aşıyor; frekans, sönüm ve süre kombinasyonunu gözden geçirin.');
  const Gamma=[...dir,0,0,0],couplings=sys.modes.map(md=>dot(md.phi,sys.M.map((x,i)=>x*Gamma[i]))),B=Bmat(point);
  let state=Array(14).fill(0),cg=Array(3).fill(0),sensor=Array(3).fill(0),connectionRelative=Array(3).fill(0),sensorRelative=Array(3).fill(0),flexRelative=0,local=sys.data.map(()=>Array(3).fill(0)),samples=[],stride=Math.max(1,Math.floor(steps/600));
  const pulse=t=>t<0||t>=tau?0:A*G*(shape==='half'?Math.sin(Math.PI*t/tau):shape==='saw'?t/tau:1-Math.abs(2*t/tau-1));
  function evaluate(t,s){
    let derivative=Array(14).fill(0),z=Array(6).fill(0),za=Array(6).fill(0),ab=pulse(t);
    for(let j=0;j<6;j++){let md=sys.modes[j],aq=-md.lambda*s[j]-2*zeta*Math.sqrt(md.lambda)*s[6+j]-couplings[j]*ab;derivative[j]=s[6+j];derivative[j+6]=aq;for(let i=0;i<6;i++){z[i]+=md.phi[i]*s[j];za[i]+=md.phi[i]*aq}}
    let ca=mv(B,za).map((x,i)=>x+dir[i]*ab),cr=mv(B,z);
    if(flexible){derivative[12]=s[13];derivative[13]=-ws*ws*s[12]-2*options.zeta*ws*s[13]-options.gain*dot(ca,dir)}
    return{derivative,z,ca,cr,sa:ca.map((x,i)=>x+dir[i]*derivative[13]),sr:cr.map((x,i)=>x+dir[i]*s[12])};
  }
  for(let step=0;step<=steps;step++){
    let t=step*dt,r=evaluate(t,state);
    for(let i=0;i<3;i++){cg[i]=Math.max(cg[i],Math.abs(r.ca[i])/G);sensor[i]=Math.max(sensor[i],Math.abs(r.sa[i])/G);connectionRelative[i]=Math.max(connectionRelative[i],Math.abs(r.cr[i])*1000);sensorRelative[i]=Math.max(sensorRelative[i],Math.abs(r.sr[i])*1000)}
    flexRelative=Math.max(flexRelative,Math.abs(state[12])*1000);
    sys.data.forEach((d,j)=>mv(tr(d.R),mv(d.B,r.z)).forEach((x,i)=>local[j][i]=Math.max(local[j][i],Math.abs(x)*1000)));
    if(step%stride===0||step===steps)samples.push([t,dot(r.ca,dir)/G,dot(r.sa,dir)/G]);if(step===steps)break;
    let k1=r.derivative,k2=evaluate(t+dt/2,state.map((x,i)=>x+dt*k1[i]/2)).derivative,k3=evaluate(t+dt/2,state.map((x,i)=>x+dt*k2[i]/2)).derivative,k4=evaluate(t+dt,state.map((x,i)=>x+dt*k3[i])).derivative;
    state=state.map((x,i)=>x+dt*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);
  }
  return{cg,sensor,local,samples,dt,steps,end,connectionRelative,sensorRelative,flexRelative};
};
resultTable=function(rows,unit){return originalResultTable(rows.filter(r=>structureOptions().flexible||r[0]!=='Sensör').map(([name,v])=>[name==='CG'?'Bağlantı bölgesi':name,v]),unit)};
harmonicPlot=function(sys,dir,zeta,point,f){
  let options=structureOptions(),freqs=sys.modes.map(m=>m.fn);if(options.flexible)freqs.push(options.fn);
  let lo=Math.max(.01,Math.min(...freqs)/8,f/3),hi=Math.max(...freqs)*8;hi=Math.max(hi,f*3);
  let set=new Set([lo,hi,f]);for(let i=0;i<400;i++)set.add(lo*Math.pow(hi/lo,i/399));
  let modes=options.flexible?coupledModel(sys,dir,zeta,point).modes:sys.modes.map(m=>({fn:m.fn,zeta}));
  for(let m of modes)for(let j=-60;j<=60;j++){let v=m.fn*(1+j*m.zeta/6);if(v>lo&&v<hi)set.add(v)}
  let freq=[...set].sort((a,b)=>a-b),x=v=>60+700*Math.log(v/lo)/Math.log(hi/lo),y=db=>Math.max(20,Math.min(230,130-db*2.2)),h='';
  for(let db of [-40,-20,0,20,40])h+=`<path d="M60 ${y(db)}H760" stroke="#dbe6dc"/><text x="4" y="${y(db)+4}" font-size="11">${db} dB</text>`;
  for(let j=0;j<6;j++){let v=lo*Math.pow(hi/lo,j/5);h+=`<text x="${x(v)}" y="253" text-anchor="middle" font-size="11">${rf(v,1)} Hz</text>`}
  let paths=[[],[]];freq.forEach(fr=>{let h=transferPack(sys,dir,fr,zeta,point);[h.resp,h.sensor].forEach((r,j)=>paths[j].push(`${paths[j].length?'L':'M'}${x(fr)},${y(20*Math.log10(Math.max(r.T,1e-10)))}`))});
  paths.slice(0,options.flexible?2:1).forEach((p,i)=>h+=`<path d="${p.join(' ')}" fill="none" stroke="${i?'#bd8b30':'#168664'}" stroke-width="2"/>`);
  h+='<text x="75" y="18" font-size="12" fill="#168664">Bağlantı bölgesi</text>'+(options.flexible?'<text x="210" y="18" font-size="12" fill="#bd8b30">Sensör bölgesi</text>':'');r$('chart').innerHTML=h;
};
shockPlot=function(data){
  let flexible=structureOptions().flexible,scale=Math.max(.01,...data.samples.flatMap(p=>flexible?[Math.abs(p[1]),Math.abs(p[2])]:[Math.abs(p[1])])),x=t=>55+700*t/data.end,y=a=>120-95*a/scale,h='<path d="M55 120H755" stroke="#cfded4"/>';
  (flexible?[1,2]:[1]).forEach((j,i)=>{let p=data.samples.map((p,k)=>`${k?'L':'M'}${x(p[0])},${y(p[j])}`).join(' ');h+=`<path d="${p}" fill="none" stroke="${i?'#bd8b30':'#168664'}" stroke-width="1.5"/>`});
  h+=`<text x="5" y="25" font-size="11">${rf(scale)} g</text><text x="55" y="238" font-size="11">0 s</text><text x="690" y="238" font-size="11">${rf(data.end)} s</text><text x="90" y="20" font-size="12">Bağlantı (yeşil)${flexible?' · Sensör (altın)':''} · yönsel çıkış</text>`;r$('shockChart').innerHTML=h;
};
function relativeBlock(connection,sensor,flex,kind){
  let flexible=structureOptions().flexible,rows=[['Bağlantı − platform',connection]];if(flexible)rows.push(['Sensör − platform',sensor]);
  return '<h3>Referans noktalarının bağıl hareketi</h3>'+originalResultTable(rows,kind)+(flexible?`<p>Yerel esneme · sensör − bağlantı (tahrik doğrultusunda): <b>${rf(flex,4)} ${kind}</b></p>`:'')+'<p class="muted">Dinamik bağıl hareketler statik denge çevresindedir. X/Y/Z maksimumları aynı anda oluşmak zorunda değildir.'+(flexible?' Sensör−platform hesabında bağlantı hareketi ile esneme faz/zaman korunarak toplanır; ayrı maksimumlar toplanmaz.':'')+'</p>';
}
runAll=function(){
  syncStructureUI();originalRunAll();if(!sixLast)return;
  let {p,h,random,shock,v,sys,qstat}=sixLast,options=structureOptions(),flexible=options.flexible;
  let scale=p.a*G*1000,conn=h.connectionRe.map((x,i)=>Math.hypot(x,h.connectionIm[i])*scale),sens=h.sensor.relativeRe.map((x,i)=>Math.hypot(x,h.sensor.relativeIm[i])*scale),flex=Math.hypot(h.sensor.flexRe,h.sensor.flexIm)*scale;
  r$('sineResult').insertAdjacentHTML('beforeend',relativeBlock(conn,sens,flex,'mm tepe'));
  if(random)r$('psdResult').insertAdjacentHTML('beforeend',relativeBlock(random.connectionRelative,random.sensorRelative,random.flexRelative,'mm RMS')+`<p class="muted">Nokta hareketleri RMS olarak gösterilir; ${p.sigma}σ tahmini için bu değerleri ${p.sigma} ile çarpın.</p>`);
  if(shock)r$('shockResult').insertAdjacentHTML('beforeend',relativeBlock(shock.connectionRelative,shock.sensorRelative,shock.flexRelative,'mm tepe'));
  for(let id of ['sineResult','psdResult','shockResult']){
    let html=r$(id).innerHTML;
    if(!flexible)html=html.replace(/<p>Yönsel T: CG [\s\S]*?<\/p>/,'<p>Bağlantı yönsel T: '+rf(h.resp.T,3)+'</p>').replaceAll('Sensör X/Y/Z','Bağlantı X/Y/Z').replaceAll('sensör X/Y/Z','bağlantı X/Y/Z').replaceAll('sensör yönsel','bağlantı yönsel');
    else html=html.replace('Yönsel T: CG','Yönsel T: Bağlantı');
    r$(id).innerHTML=html;
  }
  let staticConnection=mv(Bmat(connectionPoint()),qstat).map(x=>x*1000);
  r$('rigResult').innerHTML=r$('rigResult').innerHTML.replaceAll('CG statik','Kütle merkezi statik')+`<p>Bağlantı referansının statik hareketi [mm]: ${staticConnection.map(x=>rf(x)).join(' / ')}</p><p class="muted">Bağlantı sonuç noktası (global mm): [${[v.sx,v.sy,v.sz].map(x=>rf(x)).join(', ')}]. Kütle merkezi yalnız kütle/atalet modelinin referansıdır. Bağlı esnek model dinamik cevap içindir; yapısal statik esneme raporlanmaz.</p>`;
};
const originalSceneRender=sceneRender;
sceneRender=function(){
  originalSceneRender();
  let canvas=r$('scene3d'),context=canvas.getContext('2d');if(!context)return;
  let cg=['cx','cy','cz'].map(k=>+r$(k).value),p=['sx','sy','sz'].map((k,i)=>+r$(k).value-cg[i]);
  if(p.some(x=>!Number.isFinite(x)))return;
  let extent=Math.max(200,...mounts.flatMap(m=>[Math.abs(m.x-cg[0])+70,Math.abs(m.y-cg[1])+70,Math.abs(m.z-cg[2])+70])),scale=180/extent;
  let c=Math.cos(cameraYaw),s=Math.sin(cameraYaw),cp=Math.cos(cameraPitch),sp=Math.sin(cameraPitch),x=canvas.width/2+(c*p[0]-s*p[1])*scale,y=canvas.height/2-(cp*p[2]-sp*(s*p[0]+c*p[1]))*scale;
  context.beginPath();context.arc(x,y,7,0,2*Math.PI);context.strokeStyle='#4f70ad';context.lineWidth=2;context.stroke();context.fillStyle='#315789';context.font='12px Segoe UI';context.fillText('Bağlantı referansı',x+10,y-12);
};
const originalExport=exportLayout;
exportLayout=function(){
  if(!sixLast)return;let options=structureOptions(),d={schema:'isolation-layout-v4',mounts,rig:sixLast.v,system:sixLast.p,structure:{...options,massPercent:+r$('structMass').value,autoConnection:r$('autoConnection').checked},loadDirection:r$('loadDirection').value,direction:r$('direction').value,plotScale:r$('plotScale').value,shockSettings:typeof shockOptions==='function'?shockOptions():undefined,vector:['vx','vy','vz'].map(k=>+r$(k).value),psd:r$('psd').value,shape:r$('shape').value};
  let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));a.download='izolator-6dof-yapi.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
importLayout=async function(e){
  try{
    let d=JSON.parse(await e.target.files[0].text()),st=d.structure;
    if(d.schema==='isolation-layout-v4'){
      if(!st||typeof st.flexible!=='boolean'||typeof st.autoConnection!=='boolean'||!Number.isFinite(st.fn)||st.fn<.1||st.fn>100000||!Number.isFinite(st.zeta)||st.zeta<.001||st.zeta>1||!Number.isFinite(st.gain)||Math.abs(st.gain)>20)throw Error();
      d.schema='isolation-layout-v3';
    }else if(['isolation-layout-v1','isolation-layout-v2','isolation-layout-v3'].includes(d.schema))st={flexible:false,fn:250,zeta:.02,gain:1,autoConnection:false};else throw Error();
    // Validate common fields before changing either the structural model or the layout.
    if(!Array.isArray(d.mounts)||d.mounts.length<2||d.mounts.length>20||d.mounts.some(m=>cols.some(k=>!Number.isFinite(m[k])||Math.abs(m[k])>1e6)||['k1','k2','k3'].some(k=>m[k]<=0))||!d.rig||Object.keys(rigDefs).some(k=>!Number.isFinite(d.rig[k]))||!d.system||Object.keys(defs).some(k=>d.system[k]!==undefined&&(!Number.isFinite(d.system[k])||d.system[k]<defs[k][3]||d.system[k]>defs[k][4]))||!['0,0,1','1,0,0','0,1,0','custom'].includes(d.direction)||!Array.isArray(d.vector)||d.vector.length!==3||!d.vector.every(Number.isFinite))throw Error();
    if(st.massPercent!==undefined&&(!Number.isFinite(st.massPercent)||st.massPercent<.01||st.massPercent>99))throw Error();r$('structMass').value=st.massPercent??10;r$('bodyMode').value=st.flexible?'flexible':'rigid';r$('structFn').value=st.fn;r$('structZeta').value=st.zeta;r$('structGain').value=st.gain;r$('autoConnection').checked=st.autoConnection;
    if(d.shockSettings){let o=d.shockSettings;if(!['auto','linear','bilinear'].includes(o.law)||![0,5,10,15,20].includes(o.pre)||![0,5,10,15,20].includes(o.post))throw Error();r$('compRate').value=Math.max(o.pre,o.post)}else {r$('compRate').value=0}
    r$('plotScale').value=d.plotScale==='linear'?'linear':'log';
    await originalImportLayout({target:{files:[{text:async()=>JSON.stringify(d)}]}});
  }catch{alert('Geçerli bir yapı/yerleşim JSON dosyası seçin.')}
};
r$('layoutSave').onclick=()=>exportLayout();r$('layoutLoad').onchange=e=>importLayout(e);

