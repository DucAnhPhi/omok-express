import * as admin from "firebase-admin";

export default class FirebaseFunctions {
  firestore: FirebaseFirestore.Firestore;
  firebaseAuth: admin.auth.Auth;

  constructor(
    firestore: FirebaseFirestore.Firestore,
    firebaseAuth: admin.auth.Auth
  ) {
    this.firestore = firestore;
    this.firebaseAuth = firebaseAuth;
  }

  updateProfilePoints(uid: string, points: number) {
    return this.firestore
      .collection("profiles")
      .doc(uid)
      .update({
        points
      })
      .catch(e => console.log(e));
  }

  getProfileById(uid: string) {
    return this.firestore
      .collection("profiles")
      .doc(uid)
      .get()
      .then(doc => doc.data())
      .catch(e => console.log(e));
  }

  deleteGuest(uid: string): Promise<void> {
    return Promise.all([
      this.firestore
        .collection("profiles")
        .doc(uid)
        .delete()
        .then(() => undefined),
      this.firebaseAuth.deleteUser(uid)
    ])
      .then(() => undefined)
      .catch(e => console.log(e));
  }
}
