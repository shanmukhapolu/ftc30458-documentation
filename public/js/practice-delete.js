import { db } from "./firebase.js?v=20260920-02";
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
  const logsSnapshot = await getDocs(logsRef);
  const logRefs = logsSnapshot.docs.map(snapshot => snapshot.ref);

  for (let index = 0; index < logRefs.length; index += 500) {
    const batch = writeBatch(db);
    logRefs.slice(index, index + 500).forEach(logRef => batch.delete(logRef));
    await batch.commit();
  }

  await deleteDoc(practiceRef);

  // Verify that the practice and its log subcollection are gone.
  const [practiceCheck, logsCheck] = await Promise.all([
    getDoc(practiceRef),
    getDocs(logsRef)
  ]);

  if (practiceCheck.exists()) {
    throw new Error("The practice document still exists after deletion.");
  }

  if (!logsCheck.empty) {
    throw new Error("Some member logs still exist after deletion.");
  }

  return {
    deletedPracticeId: practiceId,
    deletedLogCount: logRefs.length
  };
}
