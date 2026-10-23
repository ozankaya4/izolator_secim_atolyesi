'use strict';
const timeSVG=r$('shockChart');
timeSVG.insertAdjacentHTML('afterend','<h3>Şok bağıl deplasman cevabı · tahrik doğrultusu [mm]</h3><p class="muted">Bağlantı−platform: yeşil · sensör−platform: altın · sensör−bağlantı (yerel esneme): mor. Statik denge çevresindeki hareketlerdir; rijit modelde yalnız bağlantı gösterilir.</p><svg id="shockDisplacementChart" viewBox="0 0 800 250" aria-label="Şok bağıl deplasman zaman cevabı"></svg><p class="muted">R17 · Zaman ekseni en fazla +500 ms. Her iki grafikte tekerlek: yakınlaştır / uzaklaştır · sürükle: zamanı kaydır · çift tıkla: otomatik aralığa dön. Zaman eksenleri senkrondur. Tepe sonuçları tam süreden alınır.</p>');
const displacementSVG=r$('shockDisplacementChart');
for(const svg of [timeSVG,displacementSVG]){svg.setAttribute('tabindex','0');svg.setAttribute('role','img');svg.style.touchAction='none';svg.style.cursor='grab'}
let timeState=null;
function responseTimeRange(sets,channels,pulseEnd,tau){
 let first=Math.min(0,...sets.map(s=>s.data[0]?.[0]-s.shift||0)),last=pulseEnd,gap=0;
 for(let s of sets){let peak=channels.map(j=>s.data.reduce((p,v)=>Math.max(p,Math.abs(v[j])),0));for(let i=0;i<s.data.length;i++){let v=s.data[i],t=v[0]-s.shift;if(i)gap=Math.max(gap,v[0]-s.data[i-1][0]);if(channels.some((j,k)=>peak[k]>1e-10&&Math.abs(v[j])>=peak[k]*.01))last=Math.max(last,t)}}
 let end=Math.max(pulseEnd,last)+Math.max(2*tau,2*gap),pad=Math.max(tau*.25,(end-first)*.02);return [first-pad,end+pad];
}
function timeWindow(lo,hi,bounds){let span=Math.max(1e-6,Math.min(hi-lo,bounds[1]-bounds[0])),a=Math.max(bounds[0],Math.min(lo,bounds[1]-span));return [a,a+span]}
function drawTimePanel(target,channels,unit,clipId){
 if(!timeState)return;const {sets,tau,range}=timeState,[lo,hi]=range,x=t=>65+680*(t-lo)/(hi-lo);let max=.001;
 for(let s of sets)for(let v of s.data)if(v[0]-s.shift>=lo&&v[0]-s.shift<=hi)for(let j of channels)max=Math.max(max,Math.abs(v[j]));let y=v=>130-85*v/max,svg=`<defs><clipPath id="${clipId}"><rect x="65" y="35" width="680" height="185"/></clipPath></defs>`;
 for(let v of [-max,-max/2,0,max/2,max])svg+=`<path d="M65 ${y(v)}H745" stroke="#dbe5dc"/><text x="3" y="${y(v)+4}" font-size="11">${rf(v,3)} ${unit}</text>`;
 for(let i=0;i<=5;i++){let t=lo+(hi-lo)*i/5;svg+=`<text x="${x(t)}" y="245" text-anchor="middle" font-size="11">${rf(t*1000,2)} ms</text>`}
 svg+=`<g clip-path="url(#${clipId})">`;for(let t of [0,tau])svg+=`<path d="M${x(t)} 35V220" stroke="#a5a5b9" stroke-dasharray="3 3"/>`;
 for(let s of sets)for(let j of channels){let pts=s.data.filter((v,i,a)=>{let t=v[0]-s.shift;return (t>=lo&&t<=hi)||(t<lo&&a[i+1]?.[0]-s.shift>=lo)||(t>hi&&a[i-1]?.[0]-s.shift<=hi)});svg+=`<path d="${pts.map((v,i)=>`${i?'L':'M'}${x(v[0]-s.shift)},${y(v[j])}`).join(' ')}" fill="none" stroke="${j===1||j===3?'#168664':j===5?'#8652a7':'#bd8b30'}" stroke-width="${s.dashed?1.3:2}" ${s.dashed?'stroke-dasharray="6 4"':''}/>`}
 svg+='</g><text x="65" y="17" font-size="12">'+(unit==='g'?'İvme [g]':'Bağıl deplasman [mm]')+' · düz: seçili profil / kesikli: saf darbe</text>';target.innerHTML=svg;
}
function drawTimeChart(){if(!timeState)return;drawTimePanel(timeSVG,timeState.channels,'g','shockTimeClip');drawTimePanel(displacementSVG,timeState.channels.length===2?[3,4,5]:[3],'mm','shockDispClip')}
const rangePlotBase=shockPlot;
shockPlot=function(d){rangePlotBase(d);if(!d.profile)return;const flex=structureOptions().flexible,p=d.profile,r=d.reference,sets=[{data:d.samples,shift:p.mainStart,dashed:false},...(r?[{data:r.samples,shift:0,dashed:true}]:[])],channels=flex?[1,2]:[1],auto=responseTimeRange(sets,flex?[1,2,3,4,5]:[1,3],p.end-p.mainStart,d.tau),end=Math.max(...sets.map(s=>s.data.at(-1)[0]-s.shift));auto[0]=Math.max(-.5,auto[0]);auto[1]=Math.max(auto[0]+1e-6,Math.min(auto[1],end,.5));timeState={sets,channels,tau:d.tau,auto,range:auto.slice(),bounds:[auto[0],.5]};drawTimeChart()};
function changeTimeRange(lo,hi){if(timeState){timeState.range=timeWindow(lo,hi,timeState.bounds);drawTimeChart()}}
function zoomTime(factor,ratio=.5){if(!timeState)return;let [lo,hi]=timeState.range,center=lo+(hi-lo)*ratio,span=(hi-lo)*factor;changeTimeRange(center-span*ratio,center+span*(1-ratio))}
let timeDrag=null;
function resetTime(){if(timeState){timeState.range=timeState.auto.slice();drawTimeChart()}}
for(const svg of [timeSVG,displacementSVG]){
svg.addEventListener('wheel',e=>{if(!timeState)return;e.preventDefault();let rect=svg.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,((e.clientX-rect.left)*800/rect.width-65)/680));zoomTime(Math.exp(Math.max(-.5,Math.min(.5,e.deltaY*.002))),ratio)},{passive:false});

svg.addEventListener('pointerdown',e=>{if(!timeState||e.button!==0)return;timeDrag={x:e.clientX,range:timeState.range.slice()};svg.setPointerCapture(e.pointerId);svg.style.cursor='grabbing'});
svg.addEventListener('pointermove',e=>{if(!timeDrag)return;let rect=svg.getBoundingClientRect(),span=timeDrag.range[1]-timeDrag.range[0],shift=(e.clientX-timeDrag.x)/(rect.width*680/800)*span;changeTimeRange(timeDrag.range[0]-shift,timeDrag.range[1]-shift)});
for(let name of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(name,()=>{timeDrag=null;svg.style.cursor='grab'});
svg.addEventListener('dblclick',resetTime);
svg.addEventListener('keydown',e=>{if(!timeState)return;let [lo,hi]=timeState.range,step=(hi-lo)*.15;if(['+','=','-','ArrowLeft','ArrowRight','Home'].includes(e.key))e.preventDefault();if(e.key==='+'||e.key==='=')zoomTime(.8);if(e.key==='-')zoomTime(1.25);if(e.key==='ArrowLeft')changeTimeRange(lo-step,hi-step);if(e.key==='ArrowRight')changeTimeRange(lo+step,hi+step);if(e.key==='Home')resetTime()});
}
if(sixLast?.shock)shockPlot(sixLast.shock);
