# Firebase Setup Guide

This guide will help you set up Firebase for the Blood Bank Management System.

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add Project" or "Create Project"
3. Enter project name: `blood-bank-app`
4. Accept the terms and click "Create Project"
5. Wait for Firebase to set up your project (usually 1-2 minutes)

## Step 2: Enable Authentication

1. In Firebase Console, go to **Authentication** (left sidebar)
2. Click **Get Started** or **Sign-in method**
3. Click on **Email/Password**
4. Enable it and click **Save**

Your authentication is now configured!

## Step 3: Create Firestore Database

1. Go to **Firestore Database** in Firebase Console
2. Click **Create Database**
3. Select **Start in test mode** (for development)
4. Choose your region (nearest to you)
5. Click **Create**

## Step 4: Configure Firestore Security Rules

1. In Firestore, go to **Rules** tab
2. Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to access their own data
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Click **Publish**

## Step 5: Get Firebase Configuration

1. Go to **Project Settings** (gear icon at top)
2. Scroll down to **Your apps** section
3. Click on **Web** (</> icon) to add a web app
4. Enter app name: `blood-bank-app`
5. Check "Also set up Firebase Hosting for this app"
6. Click **Register app**
7. Click **Copy** next to the Firebase config object

The config will look like:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};
```

## Step 6: Update Project Configuration

1. Open `assets/js/firebase-config.js`
2. Replace the placeholder values with your actual Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## Step 7: Create Collections in Firestore

Firestore will automatically create collections when you add data. The app will create these collections:

- `users` - All user accounts
- `donors` - Donor profiles
- `organizations` - Organization profiles
- `hospitals` - Hospital profiles
- `bloodInventory` - Blood stock records
- `bloodRequests` - Blood request records
- `notifications` - System notifications

## Step 8: Test the Setup

1. Start your local server (see README.md)
2. Navigate to `http://localhost:8000`
3. Click **Register** and create a test account
4. You should see data appearing in your Firestore Database

## Verification Checklist

- [ ] Firebase project created
- [ ] Authentication enabled (Email/Password)
- [ ] Firestore Database created
- [ ] Security rules configured
- [ ] Firebase config added to project
- [ ] Project running locally
- [ ] Test account created successfully
- [ ] Data visible in Firestore

## Troubleshooting

### "Failed to authenticate" error
- Verify API key is correct
- Check that Authentication is enabled in Firebase
- Clear browser cache and try again

### "Permission denied" error
- Check Firestore security rules
- Ensure user is logged in
- Verify rules allow read/write for authenticated users

### Collections not appearing in Firestore
- Collections are created when you add data
- Create a test account to trigger initial data creation
- Check the database section in Firebase Console

### "Firebase SDK" error
- Verify Firebase CDN links are working
- Check internet connection
- Ensure firebaseConfig is properly initialized

## Next Steps

1. **Development**: Start developing and testing features
2. **Testing**: Create test accounts for each user role
3. **Production**: When ready, update security rules for production
4. **Deployment**: Deploy to Firebase Hosting or other platforms

## Security Rules for Production

For production, update your Firestore rules to:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read their own document
    match /users/{uid} {
      allow read: if request.auth.uid == uid;
      allow write: if request.auth.uid == uid;
    }
    
    // Donors can read all donor profiles
    match /donors/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == docId;
    }
    
    // Similar rules for other collections
    match /organizations/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == docId;
    }
    
    match /hospitals/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == docId;
    }
    
    // Blood inventory
    match /bloodInventory/{docId} {
      allow read: if request.auth != null;
      allow create, write: if request.auth.token.role == 'organization';
    }
    
    // Blood requests
    match /bloodRequests/{docId} {
      allow read: if request.auth != null;
      allow create: if request.auth.token.role == 'hospital';
      allow write: if request.auth.token.role == 'organization';
    }
    
    // Notifications
    match /notifications/{docId} {
      allow read: if request.auth.uid == resource.data.recipientId;
      allow write: if request.auth != null;
    }
  }
}
```

## Monitoring and Analytics

1. Go to **Analytics** in Firebase Console
2. Monitor user signups and activity
3. Track errors in **Crash Reporting**
4. Review performance in **Performance Monitoring**

## Support Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Console](https://console.firebase.google.com/)
- [Stack Overflow Firebase Tag](https://stackoverflow.com/questions/tagged/firebase)
- [Firebase Discord Community](https://discord.gg/firebase)

---

**Note**: Keep your Firebase configuration secure. Never commit API keys to public repositories.
