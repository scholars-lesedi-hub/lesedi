"use strict";
const pilotKey = "lesedi-results-managed-v1";
const identityKey = pilotKey + ":open-user";
const pilotStatus = value => $("pilotStatus").textContent = value;
const workspaceElement = $("pilotWorkspace");
const chooseClass = $("pilotClass");
let client;
let userId;
let workspace;
let activeAssignment;
let baseRevision;
let syncedRows;
let busy = false;
let offlineReady = false;

function loadStored(name) {
 try { return JSON.parse(localStorage.getItem(name)); }
 catch { return null; }
}

function draftKey(id) { return pilotKey+":"+userId+":class:"+id; }
function workspaceKey(id) { return pilotKey+":"+id+":assignments"; }

function persistDraft() {
 if (!activeAssignment || workspace.role!=="teacher") return true;
 const rows = JSON.stringify(current.rows);
 try {
  if (rows===syncedRows) localStorage.removeItem(draftKey(activeAssignment.id));
  else localStorage.setItem(draftKey(activeAssignment.id),JSON.stringify({revision:baseRevision,rows:current.rows}));
  $("syncState").textContent = rows===syncedRows ? "Matches last downloaded copy" : "Changes saved on this device";
  return true;
 } catch {
  $("syncState").textContent = "Device storage failed. Keep this page open and sync before closing.";
  return false;
 }
}

function loadAssignment(id, preserveRows) {
 const selected = workspace.classes.find(entry=>entry.id===id);
 if (!selected) return;
 activeAssignment = selected;
 const stored = workspace.role==="teacher" ? loadStored(draftKey(id)) : null;
 baseRevision = stored?.revision ?? selected.revision;
 syncedRows = JSON.stringify(selected.pupils);
 const visible = workspace.classes.filter(entry=>entry.year===selected.year&&entry.term===selected.term);
 const levels = [...new Set(visible.map(entry=>entry.level))];
 const levelId = entry=>levels.indexOf(entry.level)+1;
 data = {
  school:workspace.school, year:selected.year, term:String(selected.term), standard:levelId(selected),
  className:selected.stream, terms:{[selected.year+"/"+selected.term]:workspace.cutoffs},
  levels:levels.map((name,index)=>({id:index+1,name,subjects:visible.find(entry=>entry.level===name).subjects})),
  classes:visible.map(entry=>({year:entry.year,term:String(entry.term),standard:levelId(entry),
   name:entry.stream,rows:structuredClone(entry===selected ? preserveRows ?? stored?.rows ?? entry.pupils : entry.pupils)}))
 };
 current=data.classes.find(group=>group.standard===data.standard&&group.name===data.className);
 renderSummary();
 render();
 if(workspace.role==="headteacher"){
  for(const control of $("marks").querySelectorAll("input,select,button"))control.disabled=true;
  $("syncState").textContent="School analysis includes synced classes for the selected term.";
 }else{
  $("syncState").textContent=JSON.stringify(current.rows)===syncedRows?"Matches last downloaded copy":"Changes saved on this device";
 }
 chooseClass.value=id;
}

function showWorkspace(next, selected=activeAssignment?.id, preserveRows) {
 workspace=next;
 $("pilotSync").hidden=next.role!=="teacher";
 $("pilotDiscard").hidden=next.role!=="teacher";
 $("add").hidden=next.role!=="teacher";
 $("pastePanel").hidden=next.role!=="teacher";
 $("pilotRole").textContent=next.school+" · "+(next.role==="teacher"?"Teacher":"Headteacher");
 chooseClass.replaceChildren(...next.classes.map(entry=>new Option(
  entry.level+" · Stream "+entry.stream+" · Term "+entry.term+" · "+entry.year,entry.id
 )));
 if(!next.classes.length){
  activeAssignment=null;workspaceElement.hidden=true;
  pilotStatus("No classes are assigned. Ask your school’s pilot administrator.");
  return;
 }
 workspaceElement.hidden=false;
 if(next.role==="headteacher")$("scope").value="school";
 loadAssignment(next.classes.some(entry=>entry.id===selected)?selected:next.classes[0].id,preserveRows);
}
chooseClass.onchange=()=>{
 if(!persistDraft()){chooseClass.value=activeAssignment.id;return;}
 loadAssignment(chooseClass.value);
};

function lockWorkspace(){
 try { localStorage.removeItem(identityKey); } catch {}
 userId=null;workspace=null;activeAssignment=null;current=null;
 data=fresh();
 $("marks").replaceChildren();
 $("summary").replaceChildren();
 $("learner").replaceChildren();
 $("reports").replaceChildren();
 $("paste").value="";
 workspaceElement.hidden=true;
 $("pilotRole").textContent="";
 pilotStatus("Workspace locked. Reconnect and open your assigned classes.");
}

function runBusy(action){
 return async()=>{
  if(busy)return;
  busy=true;
  workspaceElement.inert=true;
  $("pilotOpen").disabled=true;
  $("pilotLock").disabled=true;
  try { await action(); }
  catch(error){pilotStatus(error.message||"Connection unavailable. Saved work is still on this device.");}
  finally{
   busy=false;workspaceElement.inert=false;
   $("pilotOpen").disabled=false;$("pilotLock").disabled=false;
  }
 };
}

async function connect() {
 if(!navigator.onLine)throw Error("You’re offline. Reconnect to open or sync your assigned classes.");
 if(!client){
  if(!window.supabase)throw Error("The connection to Education Lesedi is unavailable. Reload when online.");
  client=window.supabase.createClient(PILOT_URL,PILOT_KEY);
  client.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")lockWorkspace();});
 }
 const {data:auth,error}=await client.auth.getUser();
 if(error&&error.name!=="AuthSessionMissingError"&&![401,403].includes(error.status)){
  throw Error("Could not verify your sign-in. Check your connection and try again.");
 }
 if(error||!auth?.user){lockWorkspace();throw Error("Sign in on Education Lesedi, then return to this page.");}
 if(userId&&userId!==auth.user.id)lockWorkspace();
 return auth.user.id;
}

async function refreshWorkspace(discard=false) {
 const id=await connect();
 const {data:next,error}=await client.rpc("lesedi_results_pilot_workspace");
 if(error)throw Error("Could not load classes. Try again when connected.");
 if(!next){lockWorkspace();throw Error("Your account has not been assigned to the results pilot.");}
 if(userId===id&&current&&workspace?.role==="teacher"&&!discard&&!persistDraft())throw Error("Sync your current class before refreshing. Device storage is unavailable.");
 if(discard&&activeAssignment&&userId===id)localStorage.removeItem(draftKey(activeAssignment.id));
 userId=id;
 try {
  if(next.role==="teacher"){
   localStorage.setItem(workspaceKey(id),JSON.stringify(next));
   localStorage.setItem(identityKey,JSON.stringify(id));
  }else localStorage.removeItem(identityKey);
 }catch{
  showWorkspace(next);
  throw Error("Classes opened. This browser could not prepare an offline copy.");
 }
 showWorkspace(next);
 pilotStatus(next.role==="teacher"?(offlineReady?"Assigned classes loaded. You can work offline.":"Assigned classes loaded. Keep this page open until offline setup finishes."):"School results refreshed.");
}

$("pilotOpen").onclick=runBusy(()=>refreshWorkspace());
$("pilotLock").onclick=()=>{
 if(!persistDraft())return;
 lockWorkspace();
};
$("pilotDiscard").onclick=runBusy(async()=>{
 if(!confirm("Replace this device’s draft for the selected class with the latest online copy?"))return;
 await refreshWorkspace(true);
});
$("pilotSync").onclick=runBusy(async()=>{
 const assignment=activeAssignment;
 const id=userId;
 const revision=baseRevision;
 const rows=structuredClone(current.rows);
 if(rows.some(row=>!identified(row,current)||Object.values(row.marks).some(value=>readMark(value).status==="invalid"))){
  throw Error("Check IDs, names and invalid marks before syncing. Blank marks and ABS are allowed.");
 }
 persistDraft();
 if(await connect()!==id||userId!==id)throw Error("The signed-in account changed. Reopen your workspace.");
 const {data:nextRevision,error}=await client.rpc("lesedi_results_pilot_save",{
  p_class:assignment.id,p_revision:revision,p_pupils:rows
 });
 if(error){
  if(error.code==="40001")throw Error("A newer copy is online. Your draft is still here. Export its CSV before choosing Load online copy.");
  throw Error(error.code==="22023"?error.message:"Sync failed. Try again when connected.");
 }
 if(userId!==id)return;
 Object.assign(assignment,{revision:nextRevision,pupils:rows});
 baseRevision=nextRevision;
 syncedRows=JSON.stringify(rows);
 try{
  localStorage.setItem(workspaceKey(id),JSON.stringify(workspace));
  localStorage.removeItem(draftKey(assignment.id));
 }catch{
  pilotStatus("Synced online. Device storage could not refresh its offline copy.");
  return;
 }
 $("syncState").textContent="Synced";
 pilotStatus("Class synced. The headteacher can refresh school results.");
});
window.addEventListener("storage",event=>{
 if(event.key?.startsWith("sb-")&&event.key.endsWith("-auth-token")&&!event.newValue)lockWorkspace();
 if(event.key===identityKey&&!event.newValue)lockWorkspace();
});
if("serviceWorker" in navigator && window.isSecureContext){
 navigator.serviceWorker.register("./sw.js").then(()=>navigator.serviceWorker.ready).then(()=>{
  offlineReady=true;
  $("pilotOffline").textContent="Offline page installed. This device can reopen cached teacher classes.";
 }).catch(()=>{$("pilotOffline").textContent="Offline reopening is unavailable. Keep this page open while working offline.";});
}
const previous=loadStored(identityKey);
const cached=typeof previous==="string"?loadStored(workspaceKey(previous)):null;
if(cached?.role==="teacher"){
 userId=previous;
 showWorkspace(cached);
 pilotStatus("Cached teacher workspace. Sync when connected.");
}
window.addEventListener("online",()=>pilotStatus("You’re online. Open or sync your classes."));
window.addEventListener("offline",()=>pilotStatus("You’re offline. Teacher edits are saved on this device."));
