export default class FirebaseFunctions {
  firestore: FirebaseFirestore.Firestore;

  constructor(firestore: FirebaseFirestore.Firestore) {
    this.firestore = firestore;
  }

  updateProfilePoints(uid: string, points: number) {
    return this.firestore
      .collection("profiles")
      .doc(uid)
      .update({
        points
      });
  }

  getProfileById(uid: string) {
    return this.firestore
      .collection("profiles")
      .doc(uid)
      .get()
      .then(doc => doc.data());
  }
}
