# Firebase Integration Plan

This plan details the implementation of a Firebase-backed backend for **100 Days to Save the World**. It covers Firebase Hosting, Authentication (anonymous + account linking), cloud save synchronization, and a global leaderboard.

---

## User Review Required

Please review the proposed design decisions below. Highlighted in caution are the security rules and score formulation constraints.

> [!CAUTION]
> **Leaderboard Integrity**: Firestore security rules must block any modifications (`update` or `delete`) to leaderboard runs once written. This ensures scores cannot be tampered with after they are submitted.
> However, because client-side code writes directly to Firestore, a technically savvy player could simulate a write with arbitrary scores. To prevent this permanently, in a production phase we would migrate the write step to a Firebase Cloud Function. For this initial integration, we will use strict Firestore rules.

> [!NOTE]
> **Offline-First Save Strategy**: We will maintain local saves via `AsyncStorage` as the primary source of truth. Firebase updates will run asynchronously in the background. If the user plays offline, changes sync next time they are online.

---

## Proposed Changes

We will introduce Firebase SDK integration, create new stores and screens, modify local save behaviors, and configure deployment settings.

```
├── firebase.json                 # [NEW] Firebase project hosting configuration
├── .firebaserc                   # [NEW] Firebase environment alias target
├── app/
│   ├── index.tsx                 # [MODIFY] Connect TitleScreen to Auth & Leaderboards
│   └── game.tsx                  # [MODIFY] Check for active run sync conflicts on start
│
└── src/
    ├── components/
    │   ├── AccountModal.tsx      # [NEW] User profile, name editor, and login/linking UI
    │   ├── LeaderboardModal.tsx  # [NEW] Top runs, scrolling ranks, score breakdown
    │   └── index.tsx             # [MODIFY] Export new modals
    ├── engine/
    │   ├── firebase.ts           # [NEW] Firebase app initialization & service exports
    │   ├── SaveEngine.ts         # [MODIFY] Sync saves to Firestore & write completed runs to leaderboard
    │   └── types.ts              # [MODIFY] Add user profile, auth states, and leaderboard interfaces
    └── store/
        └── authStore.ts          # [NEW] Zustand store managing firebase auth user and sync statuses
```

---

### 1. Project Dependencies

We will install the core Firebase Web JS SDK. Because we are targeting Expo Go and Web exports without native development clients, the JS SDK is the most portable and easiest option.

```bash
npm install firebase
```

---

### 2. Firebase Configuration & Initialization

Create a firebase configuration module to export the initialized services.

#### [NEW] [firebase.ts](file:///D:/source/repos/hundred-days/src/engine/firebase.ts)
```typescript
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.firebaseApiKey || process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: Constants.expoConfig?.extra?.firebaseAuthDomain || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: Constants.expoConfig?.extra?.firebaseProjectId || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: Constants.expoConfig?.extra?.firebaseStorageBucket || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: Constants.expoConfig?.extra?.firebaseAppId || process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Initialize App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth with AsyncStorage persistence for React Native / Expo Go
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

const db = getFirestore(app);

export { auth, db };
```

---

### 3. Authentication & Profile Management

We will use **Anonymous Authentication** on startup so players can start playing, saving, and posting leaderboard scores immediately without registration.
We will then allow them to link their anonymous account to an email and password to secure their progress across devices.

#### [NEW] [authStore.ts](file:///D:/source/repos/hundred-days/src/store/authStore.ts)
A Zustand store to track user auth state and profile metadata.
- Automatically handles `onAuthStateChanged` to listen for user status.
- Triggers anonymous sign-in if no user session is found.
- Manages local states for display name editing and profile sync statuses.

#### [NEW] [AccountModal.tsx](file:///D:/source/repos/hundred-days/src/components/AccountModal.tsx)
A modal styled with the game's display system (Ink `#1A1208`, Parchment `#F5EAD6`, Gold `#B8860B`, Blood `#8B1A1A`):
- Displays current user UID and status (e.g. *Anonymous* or *Linked Account*).
- Allows editing the player's profile name (defaulting to "The Traveler").
- Offers an **Account Linking** form (Email & Password inputs) with validation to convert the anonymous account to a permanent credential.

---

### 4. Firestore Database Schema

Firestore will store two primary collections: `users` (private profile data & cloud saves) and `leaderboard` (public rankings).

#### Private Profiles: `users/{userId}`
```typescript
interface UserDocument {
  uid: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  appSettings: AppSettings;
  metaProgress: MetaProgress | null;
  activeRun: SaveFile | null; // Serves as the cloud backup of active gameplay
}
```

#### Public Leaderboards: `leaderboard/{runId}`
```typescript
interface LeaderboardDocument {
  runId: string;
  userId: string;
  playerName: string;
  score: number;
  outcome: 'victory' | 'defeat' | 'timeout' | 'abandoned';
  finalDay: number;
  finalLocation: number;
  finalLevel: number;
  companionsRecruited: string[];
  turnsPlayed: number;
  summary: string;
  submittedAt: string;
}
```

---

### 5. Leaderboard Score Calculation

To make the global leaderboard competitive and engaging, the game will calculate a score upon run completion.

$$\text{Score} = \text{Victory Bonus} + \text{Location Score} + \text{Day Efficiency} + \text{Level Score} + \text{Gold Score} + \text{Companion Score} + \text{Morale Score}$$

* **Victory Bonus**: `+10,000` points if the outcome is `'victory'`.
* **Location Score**: `locationId * 150` points (up to `18,750` for location 125).
* **Day Efficiency**: `Math.max(0, 100 - dayNumber) * 120` points (rewards faster completions; up to `12,000` points).
* **Level Score**: `player.level * 400` points (rewards leveling up, up to `4,000` points).
* **Companion Score**: `companions.length * 800` points (rewards keeping allies alive).
* **Gold Score**: `gold * 1` point.
* **Morale Score**: `morale.value * 15` points.
* **Defeat Penalty**: If the outcome is not `'victory'` (e.g. player died or ran out of time), the total accumulated score is **divided by 2**.

---

### 6. Cloud Save Synchronization (`SaveEngine.ts`)

We will update [SaveEngine.ts](file:///D:/source/repos/hundred-days/src/engine/SaveEngine.ts) to push and pull saves to/from Firestore:

1. **Write Save**: In `saveRun()`, after writing to `AsyncStorage`, check if Firebase Auth has a logged-in user and if the internet is active. If so, update the `activeRun` field in the user's Firestore document.
2. **Conflict Resolution on Startup**:
   - When launching the game, if online, compare the `savedAt` timestamp of the local save in `AsyncStorage` against the cloud save in Firestore.
   - If the cloud save is newer (e.g. user played on another device), present a modal:
     > *"We found a newer save in the cloud (Day X, Level Y, saved on Z) than your local device. Which one would you like to keep?"*
   - Provide options: **Restore Cloud Save** or **Keep Local Save**.
3. **Run Completion**: When a run is complete, `SaveEngine` archives it locally and automatically creates a new document in the `leaderboard` collection with the calculated score.

---

### 7. Global Leaderboard UI

We will create a new modal `LeaderboardModal.tsx` displaying the global scoreboard.

#### [NEW] [LeaderboardModal.tsx](file:///D:/source/repos/hundred-days/src/components/LeaderboardModal.tsx)
- Fetches the top 50 runs ordered by `score` descending.
- Features custom list cards showcasing:
  - Placement rank (`#1`, `#2`, `#3` highlighted in Gold/Silver/Bronze colors).
  - Player Display Name.
  - Final Score (large and prominent).
  - Outcome badge (e.g., green "VICTORY", red "FELL", grey "TIMED OUT").
  - Progression details: Day reached, final Level, companions count.
- Includes a toggle to show "Global" rankings versus "My Runs" (runs filtered by the current user's UID).

---

### 8. Firebase Hosting Deployment

For hosting the web build, we configure Firebase Hosting.

#### [NEW] [firebase.json](file:///D:/source/repos/hundred-days/firebase.json)
```json
{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

#### [NEW] [.firebaserc](file:///D:/source/repos/hundred-days/.firebaserc)
```json
{
  "projects": {
    "default": "hundred-days-rpg"
  }
}
```

#### Build & Deploy Pipeline
1. Run `npx expo export --platform web` to compile React Native Web code into a static bundle in `/dist`.
2. Install tools globally: `npm install -g firebase-tools`
3. Login & deploy:
   ```bash
   firebase login
   firebase deploy --only hosting
   ```

---

### 9. Firestore Security Rules

Secure Firestore to ensure users can edit only their profiles and cannot tamper with leaderboard statistics.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // User Profile Rules
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Leaderboard Rules
    match /leaderboard/{runId} {
      // Anyone can view the leaderboard
      allow read: if true;
      
      // Users can only submit runs where they are the owner
      // Once written, entries cannot be updated or deleted to prevent scoring hacks
      allow create: if request.auth != null 
                    && request.resource.data.userId == request.auth.uid
                    && request.resource.data.score is number;
      
      allow update, delete: if false;
    }
  }
}
```
