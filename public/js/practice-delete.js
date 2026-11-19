import { db } from "./firebase.js?v=20260926-02";
import { collection, deleteDoc, doc, getDocs, getDoc, serverTimestamp, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
export async function deletePracticeCompletely(practiceId) {
  if(!practiceId) throw new Error("A practice ID is required.");
  const practiceRef=doc(db,"practices",practiceId);
  await setDoc(practiceRef,{deleting:true,deletingAt:serverTimestamp()},{merge:true});
  const names=["logs","attendance","documentSections","documentItems","documentMeta","documentHistory"];
  const snapshots=await Promise.all(names.map(name=>getDocs(collection(db,"practices",practiceId,name))));
  const refs=snapshots.flatMap(snapshot=>snapshot.docs.map(item=>item.ref));
  for(let i=0;i<refs.length;i+=450){
    const batch=writeBatch(db);
    refs.slice(i,i+450).forEach(ref=>batch.delete(ref));
    await batch.commit();
  }
  await deleteDoc(practiceRef);
  const [practiceCheck,...checks]=await Promise.all([getDoc(practiceRef),...names.map(name=>getDocs(collection(db,"practices",practiceId,name)))]);
  if(practiceCheck.exists()||checks.some(snapshot=>!snapshot.empty)) throw new Error("Some practice records remain after deletion.");
  return {deletedPracticeId:practiceId,deletedLogCount:snapshots[0].size,deletedAttendanceCount:snapshots[1].size,deletedDocumentRecordCount:snapshots.slice(2).reduce((n,s)=>n+s.size,0)};
}