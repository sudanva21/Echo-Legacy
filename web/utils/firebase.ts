import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyByZZL6Pe6uYUdCsEkWMxepfYKh12HlPQs",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "ai-expo-50d83.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "ai-expo-50d83",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "ai-expo-50d83.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "397358171248",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:397358171248:web:0190e0dd0f1d6cc8e260b5",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-B5X3V17TYK"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

let firestoreDisabled = false;

export async function logConversationToFirebase(userEmail: string, characterId: string, userMessage: string, avatarResponse: string) {
  if (firestoreDisabled) return;
  try {
    const colRef = collection(db, 'conversations');
    await addDoc(colRef, {
      user_email: userEmail || 'guest@ecolegacy.ai',
      character_id: characterId,
      user_message: userMessage,
      avatar_response: avatarResponse,
      timestamp: serverTimestamp(),
      created_at: new Date().toISOString()
    });
    console.log('[FIREBASE] Conversation logged successfully');
  } catch (err: any) {
    if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED')) {
      firestoreDisabled = true;
      console.warn('[FIREBASE] Firestore API not enabled on project; disabling firestore logging');
    } else {
      console.warn('[FIREBASE] Conversation logging skipped:', err?.message || err);
    }
  }
}

export default app;
