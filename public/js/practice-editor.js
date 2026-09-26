import { db } from "./firebase.js?v=20260926-02";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { showToast } from "./ui.js?v=20260926-02";

let currentUser = null;
let modal = null;
let mode = "create";
let editingPractice = null;
let onSaved = null;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function localToday() {
  const d = new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function defaultStartTime() {
  const d=new Date();
  const rounded=Math.ceil(d.getMinutes()/15)*15;
  d.setMinutes(rounded,0,0);
  if(d <= new Date()) d.setMinutes(d.getMinutes()+15);
  return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
}
function defaultEndTime() {
  const [h,m]=defaultStartTime().split(":").map(Number);
  const d=new Date();
  d.setHours(h,m+120,0,0);
  return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
}
function combineDateTime(dateKey,timeValue) {
  const [y,mo,day]=String(dateKey).split("-").map(Number);
  const [h,m]=String(timeValue).split(":").map(Number);
  return new Date(y,mo-1,day,h,m,0,0).getTime();
}
function formatDisplayDate(dateKey) {
  const [y,mo,day]=String(dateKey).split("-").map(Number);
  return new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric",year:"numeric"})
    .format(new Date(y,mo-1,day));
}
function injectModal() {
  if (modal) return;
  const wrapper=document.createElement("div");
  wrapper.id="practice-editor-modal";
  wrapper.className="modal-backdrop";
  wrapper.innerHTML=
    '<div class="modal practice-editor-modal">'+
      '<div class="modal-header"><div><div class="eyebrow">Practice setup</div><h2 id="practice-editor-title">New Practice</h2></div><button id="practice-editor-close" class="modal-close" type="button" aria-label="Close">×</button></div>'+
      '<form id="practice-editor-form"><div class="modal-body">'+
        '<div class="form-group"><label class="form-label" for="practice-name">Practice name</label><input id="practice-name" class="form-input" type="text" maxlength="100" placeholder="e.g., Intake Testing Session" required><div class="form-hint">Use a name that tells the team what this practice was for.</div></div>'+
        '<div class="form-row"><div class="form-group"><label class="form-label" for="practice-date">Date</label><input id="practice-date" class="form-input" type="date" required></div><div class="form-group"><label class="form-label" for="practice-location">Location</label><input id="practice-location" class="form-input" type="text" maxlength="120" placeholder="e.g., CHS Robotics Lab"></div></div>'+
        '<div class="form-row"><div class="form-group"><label class="form-label" for="practice-start">Start time</label><input id="practice-start" class="form-input" type="time" required></div><div class="form-group"><label class="form-label" for="practice-end">End time</label><input id="practice-end" class="form-input" type="time" required></div></div>'+
        '<div class="form-group"><label class="form-label" for="practice-description">Goals / notes</label><textarea id="practice-description" class="form-textarea" rows="4" maxlength="1000" placeholder="Optional goals, priorities, or notes for the team."></textarea></div>'+
        '<div id="practice-editor-error" class="notice notice-danger" style="display:none"></div>'+
        '<div class="notice notice-warning">Future practices sync for everyone, but logging remains locked until the scheduled start time.</div>'+
      '</div><div class="modal-footer"><button id="practice-editor-cancel" class="btn btn-outline" type="button">Cancel</button><button id="practice-editor-save" class="btn btn-primary" type="submit">Create Practice</button></div></form>'+
    '</div>';
  document.body.appendChild(wrapper);
  modal=wrapper;
  document.getElementById("practice-editor-close").addEventListener("click",closePracticeEditor);
  document.getElementById("practice-editor-cancel").addEventListener("click",closePracticeEditor);
  wrapper.addEventListener("click",e=>{if(e.target===wrapper)closePracticeEditor();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&modal.classList.contains("open"))closePracticeEditor();});
  document.getElementById("practice-editor-form").addEventListener("submit",savePractice);
}
function setFormValues(practice) {
  document.getElementById("practice-name").value=practice?.title||"";
  document.getElementById("practice-date").value=practice?.dateKey||localToday();
  document.getElementById("practice-start").value=practice?.startTime||defaultStartTime();
  document.getElementById("practice-end").value=practice?.endTime||defaultEndTime();
  document.getElementById("practice-location").value=practice?.location||"";
  document.getElementById("practice-description").value=practice?.description||"";
}
function showError(message){const el=document.getElementById("practice-editor-error");el.textContent=message;el.style.display="block";}
function clearError(){const el=document.getElementById("practice-editor-error");el.textContent="";el.style.display="none";}

export function initializePracticeEditor(user,callback){currentUser=user;onSaved=callback;injectModal();}
export function openPracticeEditor(practice=null){
  injectModal();
  editingPractice=practice;
  mode=practice?"edit":"create";
  clearError();
  setFormValues(practice);
  document.getElementById("practice-editor-title").textContent=practice?"Edit Practice":"New Practice";
  document.getElementById("practice-editor-save").textContent=practice?"Save Changes":"Create Practice";
  modal.classList.add("open");
  document.body.style.overflow="hidden";
  setTimeout(()=>document.getElementById("practice-name").focus(),0);
}
export function closePracticeEditor(){
  if(!modal)return;
  modal.classList.remove("open");
  document.body.style.overflow="";
}
async function savePractice(event){
  event.preventDefault();
  clearError();
  const title=document.getElementById("practice-name").value.trim();
  const dateKey=document.getElementById("practice-date").value;
  const startTime=document.getElementById("practice-start").value;
  const endTime=document.getElementById("practice-end").value;
  const location=document.getElementById("practice-location").value.trim();
  const description=document.getElementById("practice-description").value.trim();

  if(!title)return showError("Practice name is required.");
  if(!dateKey||!startTime||!endTime)return showError("Date, start time, and end time are required.");

  const startAtMs=combineDateTime(dateKey,startTime);
  const endAtMs=combineDateTime(dateKey,endTime);
  if(!Number.isFinite(startAtMs)||!Number.isFinite(endAtMs))return showError("Enter a valid date and time.");
  if(endAtMs<=startAtMs)return showError("End time must be later than the start time.");

  const button=document.getElementById("practice-editor-save");
  button.disabled=true;
  button.textContent=mode==="edit"?"Saving…":"Creating…";
  try{
    const data={title,dateKey,startTime,endTime,startAtMs,endAtMs,location,description,updatedAt:serverTimestamp()};
    let savedId;
    if(mode==="edit"){
      await updateDoc(doc(db,"practices",editingPractice.id),data);
      savedId=editingPractice.id;
      showToast(formatDisplayDate(dateKey)+" practice updated.","success");
    }else{
      const reference=await addDoc(collection(db,"practices"),{
        ...data,
        createdBy:currentUser.uid,
        createdByEmail:currentUser.email||"",
        createdAt:serverTimestamp()
      });
      savedId=reference.id;
      showToast("Practice created and synced for the whole team.","success");
    }
    closePracticeEditor();
    if(typeof onSaved==="function")onSaved(savedId);
  }catch(error){
    console.error("Practice save failed:",error);
    showError("Unable to save this practice: "+error.message);
  }finally{
    button.disabled=false;
    button.textContent=mode==="edit"?"Save Changes":"Create Practice";
  }
}
export function getPracticeStartMs(practice){
  if(Number.isFinite(Number(practice?.startAtMs)))return Number(practice.startAtMs);
  if(practice?.dateKey){
    const [y,m,d]=practice.dateKey.split("-").map(Number);
    return new Date(y,m-1,d).getTime();
  }
  return 0;
}
export function isFuturePractice(practice){return getPracticeStartMs(practice)>Date.now();}
export function practiceState(practice){
  const start=getPracticeStartMs(practice);
  return start>Date.now()?"future":"past";
}
export function formatPracticeSchedule(practice){
  if(!practice?.dateKey)return "";
  const [y,m,d]=practice.dateKey.split("-").map(Number);
  if([y,m,d].some(Number.isNaN))return "";
  const dateText=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric"}).format(new Date(y,m-1,d));
  const formatTime=time=>{
    if(!time)return "";
    const [h,min]=time.split(":").map(Number);
    return new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit"}).format(new Date(y,m-1,d,h,min||0));
  };
  const times=[formatTime(practice.startTime),formatTime(practice.endTime)].filter(Boolean);
  return dateText+(times.length?" · "+times.join("–"):"");
}
