"use strict";
const cacheName="lesedi-school-results-shell-v2";
const shell=new URL("./index.html",self.location).href;
const script=new URL("./pilot.js",self.location).href;
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll([shell,script])));
});
self.addEventListener("activate",event=>{
 event.waitUntil(Promise.all([
  self.clients.claim(),
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("lesedi-school-results-shell-")&&key!==cacheName).map(key=>caches.delete(key))))
 ]));
});
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 if(event.request.mode==="navigate"&&(url.pathname===new URL("./",self.location).pathname||url.pathname===new URL(shell).pathname)){
  event.respondWith(fetch(event.request).catch(()=>caches.match(shell)));
 }
 if(url.href===script)event.respondWith(fetch(event.request).catch(()=>caches.match(script)));
});
