import { db } from "./firebase.js?v=20260926-02";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

/**
 * Marks the practice for deletion, removes every member log, then removes
 * the practice document itself. The deleting flag makes the operation
 * resumable if the browser is interrupted before all log batches finish.
 */
export async function deletePracticeCompletely(practiceId) {
  if (!practiceId) {
    throw new Error("A practice ID is required.");
  }

  const practiceRef = doc(db, "practices", practiceId);
  await setDoc(
    practiceRef,
    {
      deleting: true,
      deletingAt: serverTimestamp()
    },
    { merge: true }
  );

  const logsRef = collection(db, "practices", practiceId, "logs");
  const attendanceRef = collection(db, "practices", practiceId, "attendance");
  const [logsSnapshot, attendanceSnapshot] = await Promise.all([
    getDocs(logsRef),
    getDocs(attendanceRef)
  ]);
  const childRefs = [
    ...logsSnapshot.docs.map(snapshot => snapshot.ref),
    ...attendanceSnapshot.docs.map(snapshot => snapshot.ref)
  ];

  for (let index = 0; index < childRefs.length; index += 500) {
    const batch = writeBatch(db);
    childRefs.slice(index, index + 500).forEach(childRef => batch.delete(childRef));
    await batch.commit();
  }

  await deleteDoc(practiceRef);

  // Verify that the practice and both child collections are gone.
  const [practiceCheck, logsCheck, attendanceCheck] = await Promise.all([
    getDoc(practiceRef),
    getDocs(logsRef),
    getDocs(attendanceRef)
  ]);

  if (practiceCheck.exists()) {
    throw new Error("The practice document still exists after deletion.");
  }

  if (!logsCheck.empty || !attendanceCheck.empty) {
    throw new Error("Some practice child records still exist after deletion.");
  }

  return {
    deletedPracticeId: practiceId,
    deletedLogCount: logsSnapshot.size,
    deletedAttendanceCount: attendanceSnapshot.size
  };
}
