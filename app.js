// ===== Tunable settings =====
let LABELS;
const MEAN=[0.485,0.456,0.406], STD=[0.229,0.224,0.225]; // Verified against this model's pretrained config
const SIZE=224, RESIZE=256, MIN_CONF=0.80, MIN_MARGIN=0.20, HEALTHY_MIN=0.90;
const $=id=>document.getElementById(id);
let I18N,ADV,session,lang="am",last=null,audio=null,savedUrls=[],statusKey="";
function setStatus(key){statusKey=key;$("status").textContent=key?I18N[lang][key]:""}
try{lang=localStorage.getItem("lang")||"am"}catch(_){}

async function init(){
  [I18N,ADV]=await Promise.all([fetch("i18n.json").then(r=>r.json()),fetch("advice.json").then(r=>r.json())]);
  if(!I18N[lang])lang="am";
  $("lang").value=lang;$("lang").onchange=e=>{lang=e.target.value;try{localStorage.setItem("lang",lang)}catch(_){};ui();if(last)show(last);renderSaved()};
  $("take").hidden=true;ui();addEventListener("online",ui);addEventListener("offline",ui);
  if("serviceWorker"in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
  $("file").onchange=run;$("again").onclick=()=>{$("out").hidden=true;$("take").hidden=false;$("tip").hidden=false};
  $("ask").onclick=saveForOfficer;renderSaved();
  ort.env.wasm.wasmPaths=new URL("ort/",document.baseURI).href;ort.env.wasm.numThreads=1;
  setStatus("loading");
  try{
    LABELS=await fetch("model/labels.json").then(r=>{if(!r.ok)throw new Error("Model labels unavailable");return r.json()});
    if(!Array.isArray(LABELS)||LABELS.length!==4||new Set(LABELS).size!==4||LABELS.some(k=>typeof k!=="string"||!ADV[k]))throw new Error("Model labels do not match reviewed advice");
    session=await ort.InferenceSession.create("model/model.onnx",{executionProviders:["wasm"]});
    $("take").hidden=false;setStatus("");ui();
  }
  catch(e){setStatus("err");console.error(e)}
}
function ui(){const t=I18N[lang];document.documentElement.lang=lang;$("title").textContent=t.title;$("tip").textContent=t.tip;
  $("takeT").textContent=t.take;$("confL").textContent=t.conf;$("ask").textContent=t.ask;$("again").textContent=t.again;$("listen").textContent="🔊 "+t.listen;
  $("disc").textContent=t.disc;$("savedTitle").textContent=t.savedTitle;$("net").textContent=session?(navigator.onLine?"":"📴 ")+t.offline:"";
  $("status").textContent=statusKey?t[statusKey]:""}

function tensorFrom(img){
  const c=document.createElement("canvas");c.width=c.height=SIZE;const x=c.getContext("2d");x.imageSmoothingQuality="high";
  const w=img.naturalWidth,h=img.naturalHeight,sc=SIZE*Math.min(w,h)/RESIZE; // center crop = 224/256 of short side
  x.drawImage(img,(w-sc)/2,(h-sc)/2,sc,sc,0,0,SIZE,SIZE);
  const d=x.getImageData(0,0,SIZE,SIZE).data,n=SIZE*SIZE,f=new Float32Array(3*n);
  for(let i=0;i<n;i++)for(let k=0;k<3;k++)f[k*n+i]=(d[i*4+k]/255-MEAN[k])/STD[k];
  return new ort.Tensor("float32",f,[1,3,SIZE,SIZE]);
}
const softmax=a=>{const m=Math.max(...a),e=a.map(v=>Math.exp(v-m)),s=e.reduce((p,q)=>p+q);return e.map(v=>v/s)};

async function run(ev){
  const f=ev.target.files[0];ev.target.value="";
  if(!f||!session)return;setStatus("analyzing");
  let url;
  try{
    url=URL.createObjectURL(f);const img=new Image();img.src=url;await img.decode();
    const t0=performance.now(),res=await session.run({[session.inputNames[0]]:tensorFrom(img)});
    const logits=Array.from(res[session.outputNames[0]].data);
    if(logits.length!==LABELS.length||logits.some(v=>!Number.isFinite(v)))throw new Error("Model output does not match labels");
    const p=softmax(logits),order=p.map((v,i)=>i).sort((a,b)=>p[b]-p[a]);
    const top=order[0],conf=p[top],margin=conf-p[order[1]];
    let key=LABELS[top],uncertain=conf<MIN_CONF||margin<MIN_MARGIN||(key==="Healthy"&&conf<HEALTHY_MIN);
    if(uncertain)key="Uncertain";
    if(last)URL.revokeObjectURL(last.url);
    last={key,conf,url,ms:Math.round(performance.now()-t0)};url=null;
    if(location.search.includes("debug=1"))console.log(LABELS.map((l,i)=>l+": "+p[i].toFixed(3)).join(" | "),last.ms+"ms");
    setStatus("");show(last);
  }catch(e){if(url)URL.revokeObjectURL(url);console.error(e);setStatus("err")}
}
function show(r){
  const a=ADV[r.key][lang]||ADV[r.key].en;$("pic").src=r.url;$("name").textContent=a.name;
  $("steps").innerHTML="";a.steps.forEach(s=>{const li=document.createElement("li");li.textContent=s;$("steps").append(li)});
  const u=r.key==="Uncertain";$("confW").hidden=u;$("confB").style.width=Math.round(r.conf*100)+"%";
  $("card").className="card "+(u?"red":r.key==="Healthy"?"":"amber");
  $("out").hidden=false;$("take").hidden=true;$("tip").hidden=true;
  $("listen").hidden=true;audio=new Audio(`audio/${r.key}_${lang}.mp3`);audio.onloadedmetadata=()=>{$("listen").hidden=false};
  $("listen").onclick=()=>audio.play();$("saved").textContent="";
}
const DB_NAME="coffee-leaf-checks",STORE="checks";
function dbOperation(mode,action){
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open(DB_NAME,1);
    open.onupgradeneeded=()=>open.result.createObjectStore(STORE,{keyPath:"id",autoIncrement:true});
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result;
      try{
        const tx=db.transaction(STORE,mode),request=action(tx.objectStore(STORE));
        tx.oncomplete=()=>{resolve(request.result);db.close()};
        tx.onerror=()=>{reject(tx.error);db.close()};
        tx.onabort=()=>{reject(tx.error);db.close()};
      }catch(e){db.close();reject(e)}
    };
  });
}
async function photoThumbnail(url){
  const img=new Image();img.src=url;await img.decode();
  const scale=Math.min(1,1024/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error("Photo encoding failed")),"image/jpeg",0.8));
}
async function saveForOfficer(){
  if(!last)return;
  $("ask").disabled=true;
  try{
    const photo=await photoThumbnail(last.url);
    await dbOperation("readwrite",s=>s.add({t:new Date().toISOString(),key:last.key,photo}));
    await renderSaved();$("saved").textContent=I18N[lang].saved;
  }catch(e){console.error(e);$("saved").textContent=I18N[lang].saveError}
  finally{$("ask").disabled=false}
}
async function shareCheck(item){
  const text=`${new Date(item.t).toLocaleString()}: ${ADV[item.key][lang]?.name||ADV[item.key].en.name}. ${I18N[lang].officerNote}`;
  const file=new File([item.photo],`coffee-leaf-${item.id}.jpg`,{type:"image/jpeg"});
  try{
    if(navigator.share&&navigator.canShare?.({files:[file]})){
      await navigator.share({text,files:[file]});return;
    }
    await navigator.clipboard.writeText(text);
    $("saved").textContent=I18N[lang].copyDone;
  }catch(e){
    if(e.name==="AbortError")return;
    console.error(e);window.prompt(I18N[lang].copyPrompt,text);
  }
}
async function renderSaved(){
  try{
    const items=await dbOperation("readonly",s=>s.getAll());
    savedUrls.forEach(u=>URL.revokeObjectURL(u));savedUrls=[];
    const list=$("observations");list.replaceChildren();
    for(const item of items.reverse()){
      const url=URL.createObjectURL(item.photo);savedUrls.push(url);
      const row=document.createElement("div");row.className="observation";
      const img=document.createElement("img");img.src=url;img.alt="";
      const title=document.createElement("p");title.textContent=`${new Date(item.t).toLocaleString()} — ${ADV[item.key][lang]?.name||ADV[item.key].en.name}`;
      const share=document.createElement("button");share.textContent=I18N[lang].share;share.onclick=()=>shareCheck(item);
      const download=document.createElement("a");download.href=url;download.download=`coffee-leaf-${item.id}.jpg`;download.textContent=I18N[lang].download;
      const remove=document.createElement("button");remove.textContent=I18N[lang].delete;
      remove.onclick=async()=>{if(!confirm(I18N[lang].deleteConfirm))return;try{await dbOperation("readwrite",s=>s.delete(item.id));await renderSaved()}catch(e){console.error(e);$("saved").textContent=I18N[lang].listError}};
      row.append(img,title,share,download,remove);list.append(row);
    }
  }catch(e){console.error(e);$("saved").textContent=I18N[lang].listError}
}
init();
