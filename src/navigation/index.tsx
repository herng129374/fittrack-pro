import React, { useContext } from "react";
import { getApps, initializeApp } from "firebase/app";
import { AuthContext } from "../provider/AuthProvider";

import { NavigationContainer } from "@react-navigation/native";

import Main from "./MainStack";
import Auth from "./AuthStack";
import Loading from "../screens/utils/Loading";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Better put your these secret keys in .env file
const firebaseConfig = {
  apiKey: "AIzaSyAHmN7uF5ibxwhs6s_5s8RFglEU5wA_CP8",
  authDomain: "myminipro-604fd.firebaseapp.com",
  projectId: "myminipro-604fd",
  storageBucket: "myminipro-604fd.firebasestorage.app",
  messagingSenderId: "451307043421",
  appId: "1:451307043421:web:26f2d333c2ab058fc66bb4",
  measurementId: "G-L7QJ47PJHX",
};
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]; // ✅ If already initialized, get the existing app
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export default () => {
  const auth = useContext(AuthContext);
  const user = auth.user;
  return (
    <NavigationContainer>
      {user == null && <Loading />}
      {user == false && <Auth />}
      {user == true && <Main />}
    </NavigationContainer>
  );
};
