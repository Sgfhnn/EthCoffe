const C="coffee-v5",CORE=["./","index.html","app.js","i18n.json","advice.json","manifest.json","icon-192.png","icon-512.png","ort/ort.min.js","ort/ort-wasm-simd-threaded.mjs","ort/ort-wasm-simd-threaded.wasm","model/model.onnx","model/labels.json"],
AUD=["Leaf_rust","Cerscospora","Phoma","Healthy","Uncertain"].flatMap(k=>["am","om","en"].map(l=>`audio/${k}_${l}.mp3`));
self.addEventListener("install",e=>{e.waitUntil((async()=>{
  const cache=await caches.open(C);
  await cache.addAll(CORE); // A new offline version must not replace a working one without its model.
  const results=await Promise.allSettled(AUD.map(url=>cache.add(url)));
  const missing=AUD.filter((_,i)=>results[i].status==="rejected");
  if(missing.length)console.warn("Audio not cached:",missing);
  await self.skipWaiting();
})())});
self.addEventListener("activate",e=>{e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith("coffee-v")&&key!==C).map(key=>caches.delete(key)));
  await self.clients.claim();
})())});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET"||new URL(e.request.url).origin!==self.location.origin)return;
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(response=>{
    if(response.ok){const copy=response.clone();e.waitUntil(caches.open(C).then(cache=>cache.put(e.request,copy)))}
    return response;
  })));
});
