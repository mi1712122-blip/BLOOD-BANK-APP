# Blood Bank Management System

A modern, comprehensive web application for managing blood donations, inventory, and requests across donors, organizations, hospitals, and administrators.

## 🎯 Features

### User Roles
- **Donor**: Manage donations, receive blood requests, track donation history
- **Organization**: Manage blood inventory, approve/reject requests, manage donors and hospitals
- **Hospital**: Request blood, view availability, track requests
- **Admin**: Manage all users, monitor system, generate reports

### Key Features
- 🔐 **Secure Authentication** - Firebase email/password authentication
- 🩸 **Blood Inventory Management** - Real-time inventory tracking with 8 blood groups
- 📱 **Blood Request System** - Emergency and regular blood requests
- 🔔 **Notification System** - Real-time notifications for all users
- 📊 **Analytics & Reports** - Comprehensive system analytics
- 📍 **Location-Based Search** - Find blood availability by city
- 📱 **Responsive Design** - Works perfectly on desktop, tablet, and mobile
- 🎨 **Modern UI** - Professional healthcare-themed interface

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Firebase (Authentication, Firestore, Storage)
- **Icons**: Font Awesome 6.4.0
- **Responsive**: Mobile-first design

## 📋 Prerequisites

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Firebase account
- Internet connection

## 🚀 Getting Started

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Authentication (Email/Password)
4. Enable Firestore Database
5. Set Firestore Rules (Development):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 2. Update Firebase Configuration

Edit `assets/js/firebase-config.js` and replace with your Firebase credentials:

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

### 3. Running the Application

1. **Option A: Using a Local Server**
```bash
# Using Python 3
python -m http.server 8000

# Or using Node.js (with http-server installed)
npx http-server
```

2. **Option B: Direct File Opening**
- Simply open `index.html` in your browser
- Note: Some features may be limited when opened directly

3. **Option C: Using VS Code Live Server**
- Install "Live Server" extension in VS Code
- Right-click `index.html` and select "Open with Live Server"

## 📁 Project Structure

```
blood_bank_app/
├── index.html                 # Landing page
├── pages/
│   ├── auth/
│   │   ├── login.html        # Login page
│   │   ├── auth-login.js     # Login logic
│   │   ├── register.html     # Registration page
│   │   └── auth-register.js  # Registration logic
│   └── dashboards/
│       ├── donor/
│       │   ├── dashboard.html
│       │   └── donor-dashboard.js
│       ├── organization/
│       │   ├── dashboard.html
│       │   └── organization-dashboard.js
│       ├── hospital/
│       │   ├── dashboard.html
│       │   └── hospital-dashboard.js
│       └── admin/
│           ├── dashboard.html
│           └── admin-dashboard.js
├── assets/
│   ├── css/
│   │   ├── global.css        # Global styles and color theme
│   │   ├── landing.css       # Landing page styles
│   │   ├── auth.css          # Authentication styles
│   │   ├── register.css      # Registration styles
│   │   └── dashboard.css     # Dashboard styles
│   ├── js/
│   │   ├── firebase-config.js    # Firebase configuration
│   │   ├── auth.js               # Authentication manager
│   │   ├── inventory.js          # Blood inventory manager
│   │   ├── requests.js           # Blood requests manager
│   │   └── landing.js            # Landing page script
│   └── images/               # Images and icons
└── README.md
```

## 📄 Legal Pages
The project includes dedicated legal pages for further compliance and user transparency:
- `privacy-policy.html`  
- `terms-of-service.html`  
- `cookie-policy.html`

## 🎨 Color Theme

```
Primary Color: #C1121F (Dark Red)
Secondary Color: #FFFFFF (White)
Background: #F5F5F5 (Light Gray)
Success: #2E7D32 (Green)
Warning: #F57C00 (Orange)
Danger: #D32F2F (Red)
Text: #333333 (Dark Gray)
```

## 📚 Firestore Collections Structure

### users
```javascript
{
  uid: string,
  email: string,
  role: 'donor' | 'organization' | 'hospital' | 'admin',
  createdAt: timestamp,
  ...roleSpecificData
}
```

### donors
```javascript
{
  uid: string,
  fullName: string,
  email: string,
  phone: string,
  bloodGroup: string,
  age: number,
  gender: string,
  city: string,
  address: string,
  totalDonations: number,
  isEligible: boolean,
  createdAt: timestamp
}
```

### organizations
```javascript
{
  uid: string,
  organizationName: string,
  email: string,
  phone: string,
  address: string,
  city: string,
  licenseNumber: string,
  isApproved: boolean,
  createdAt: timestamp
}
```

### hospitals
```javascript
{
  uid: string,
  hospitalName: string,
  email: string,
  phone: string,
  address: string,
  city: string,
  licenseNumber: string,
  isApproved: boolean,
  createdAt: timestamp
}
```

### bloodInventory
```javascript
{
  organizationId: string,
  bloodGroup: string,
  units: number,
  expiryDate: date,
  collectionDate: timestamp,
  status: 'Available' | 'Used' | 'Expired',
  createdAt: timestamp
}
```

### bloodRequests
```javascript
{
  hospitalId: string,
  hospitalName: string,
  bloodGroup: string,
  units: number,
  urgencyLevel: 'Normal' | 'Urgent' | 'Emergency',
  organizationId: string (optional),
  status: 'Pending' | 'Approved' | 'Rejected' | 'Completed',
  createdAt: timestamp
}
```

### notifications
```javascript
{
  recipientId: string,
  type: string,
  title: string,
  message: string,
  isRead: boolean,
  createdAt: timestamp
}
```

## 🔐 Security Features

- Firebase Authentication with email/password
- Role-based access control (RBAC)
- Secure Firestore rules
- Session management
- Protected routes

## 📱 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## 🚢 Deployment

### Deploy on Firebase Hosting

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Initialize Firebase in project directory
firebase init hosting

# Deploy
firebase deploy
```

### Deploy on Other Platforms

- **Netlify**: Drag and drop the folder or connect to GitHub
- **Vercel**: Connect GitHub repository
- **GitHub Pages**: Push to gh-pages branch
- **Traditional Hosting**: Upload files via FTP

## 📖 User Guide

### For Donors
1. Register as a donor with blood group and personal info
2. View blood requests from hospitals
3. Accept or reject requests
4. Track donation history
5. Receive notifications about urgent needs

### For Organizations
1. Register organization with license
2. Manage blood inventory (add/remove/update stocks)
3. View list of donors and hospitals
4. Approve/reject blood requests
5. Monitor blood stock status

### For Hospitals
1. Register hospital with license
2. Request blood specifying quantity and urgency
3. Search blood availability by location
4. Track request status
5. Receive notifications about approvals

### For Admins
1. Monitor all users and activities
2. Approve/block organizations and hospitals
3. View system analytics
4. Manage blood inventory
5. Generate reports

## 🐛 Troubleshooting

### Firebase Connection Issues
- Verify API key in firebase-config.js
- Check internet connection
- Ensure Firestore is enabled in Firebase Console

### Authentication Issues
- Clear browser cache and cookies
- Verify email format
- Check password strength (8+ chars, uppercase, lowercase, numbers)

### Dashboard Not Loading
- Check browser console for errors
- Verify user role matches dashboard path
- Ensure user is logged in

## 🤝 Support

For issues and support:
1. Check the project documentation
2. Review Firestore rules and permissions
3. Check browser console for error messages
4. Verify all Firebase credentials

## 📝 License

This project is open source and available for educational and commercial use.

## 🎓 Learning Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide)
- [CSS Flexbox & Grid](https://developer.mozilla.org/en-US/docs/Web/CSS)
- [REST API Best Practices](https://restfulapi.net/)

## 🔄 Future Enhancements

- [ ] SMS/Email notifications
- [ ] Advanced analytics charts
- [ ] Blood donation appointment booking
- [ ] Mobile app (React Native/Flutter)
- [ ] Payment integration
- [ ] API documentation
- [ ] Multi-language support
- [ ] Dark mode

## 👥 Contributors

- Lead Developer: Blood Bank Management System Team

---

**Version**: 1.0.0  
**Last Updated**: May 2024  
**Status**: Production Ready ✅
