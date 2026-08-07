# QR-Code-MERN-Project 🧾⚡

A comprehensive full-stack MERN application for managing QR codes, hierarchical user roles, and credit-based business card generation with AR tick detection.

---

## 📋 Table of Contents
- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Project Architecture](#-project-architecture)
- [Folder Structure](#-folder-structure)
- [User Roles & Hierarchy](#-user-roles--hierarchy)
- [How It Works](#-how-it-works)
- [Installation Guide](#-installation-guide)
- [Environment Variables](#-environment-variables)
- [API Endpoints](#-api-endpoints)
- [Frontend Applications](#-frontend-applications)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

---

## 🌟 Overview

This project is a **hierarchical QR code management system** designed for organizations like pharmaceutical companies where:
- **Sales/Medical Representatives (MRs)** need personalized digital business cards
- **Managers** need to allocate and track credits for QR code generation
- **Admins** need oversight of the entire process

The system features two frontend applications:
1. **Client Business Card** - QR code generation and business card management
2. **Client AR-Tick** - AR-based card scanning and checkbox detection

---

## ✨ Key Features

### 🔐 User Management
- **Hierarchical Roles**: Superadmin → Admin → TLM → SLM → FLM → MR
- **Secure Authentication**: JWT-based authentication
- **Role-Based Access Control**: Each role has specific permissions

### 💰 Credit System
- **Credit Allocation**: Admins allocate credits to TLMs
- **Credit Distribution**: TLMs distribute to SLMs → FLMs → MRs
- **Auto-Expiry**: Credits automatically expire after set duration
- **Transaction Logs**: Full audit trail of all credit movements

### 🧾 QR Code Generation
- **Credit-Based**: Each QR code consumes 1 credit
- **Dynamic Generation**: QR codes generated on-demand
- **Downloadable**: QR codes can be downloaded as PNG
- **Business Card Integration**: Each QR links to a personalized business card

### 🗂️ Doctor Card System
- **Personalized Cards**: Each QR leads to a doctor's business card
- **Form Builder**: Easy-to-use form for card details
- **Visual Templates**: Professional card templates
- **Image Cropping**: Upload and crop profile images

### 🎯 AR-Tick Detection
- **Corner Detection**: Automatic detection of card corners
- **Checkbox Analysis**: Intelligent checkbox detection using OpenCV
- **Global Thresholding**: Robust detection using Otsu thresholding
- **Real-Time Processing**: Live camera feed analysis

---

## 🛠️ Tech Stack

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | v18+ | Runtime environment |
| Express.js | v4.18+ | Web framework |
| MongoDB | v6+ | Database |
| Mongoose | v7+ | ODM for MongoDB |
| JWT | v9+ | Authentication |
| Bcrypt | v5+ | Password hashing |
| CORS | v2+ | Cross-origin resource sharing |
| Multer | v1+ | File upload handling |
| XLSX | v0.18+ | Excel file processing |

### Frontend (Client Business Card)
| Technology | Version | Purpose |
|------------|---------|---------|
| React | v18+ | UI framework |
| Vite | v4+ | Build tool |
| Tailwind CSS | v3+ | Styling |
| React Router | v6+ | Routing |
| Axios | v1+ | HTTP client |
| React QR Code | v2+ | QR code generation |
| React Image Crop | v10+ | Image cropping |
| React Hot Toast | v2+ | Toast notifications |
| React Icons | v4+ | Icons |
| Framer Motion | v10+ | Animations |

### Frontend (Client AR-Tick)
| Technology | Version | Purpose |
|------------|---------|---------|
| React | v18+ | UI framework |
| Vite | v4+ | Build tool |
| Tailwind CSS | v3+ | Styling |
| OpenCV.js | v4.5+ | Computer vision |
| React Router | v6+ | Routing |
| Axios | v1+ | HTTP client |
| Framer Motion | v10+ | Animations |
| React Hot Toast | v2+ | Toast notifications |

---

## 📁 Folder Structure

```
QR-Code-MERN-Project/
│
├── server/                          # Backend (Node.js + Express)
│   ├── config/
│   │   ├── db.js                   # MongoDB connection
│   │   └── cloudinaryConfig.js    # Cloudinary configuration
│   │
│   ├── models/                     # Database models
│   │   ├── User.js                # User model with role hierarchy
│   │   ├── Credit.js              # Credit management model
│   │   ├── Transaction.js         # Transaction logging model
│   │   ├── QR.js                  # QR code model
│   │   └── DoctorCard.js          # Doctor business card model
│   │
│   ├── controllers/                # Business logic
│   │   ├── authController.js      # Authentication handlers
│   │   ├── creditController.js    # Credit operations
│   │   ├── qrController.js        # QR generation & management
│   │   ├── doctorCardController.js # Doctor card operations
│   │   └── userController.js      # User management
│   │
│   ├── routes/                     # API routes
│   │   ├── globalRoutes.js        # Public routes
│   │   ├── superAdminRoutes.js    # Superadmin routes
│   │   ├── qrRoutes.js            # QR code routes
│   │   ├── creditRoutes.js        # Credit routes
│   │   └── [role]Routes.js        # Role-specific routes
│   │
│   ├── middleware/                 # Custom middleware
│   │   ├── auth.js                # JWT authentication
│   │   ├── roleCheck.js           # Role-based access control
│   │   └── errorHandler.js        # Error handling
│   │
│   ├── utils/                      # Utility functions
│   │   ├── qrGenerator.js         # QR code generation
│   │   ├── creditCalculator.js    # Credit calculations
│   │   └── validation.js          # Input validation
│   │
│   ├── uploads/                    # File upload directory
│   ├── qr-codes/                   # Generated QR code storage
│   ├── .env                        # Environment variables
│   ├── server.js                   # Entry point
│   └── package.json                # Dependencies
│
├── client-business-card/           # Frontend - Business Card
│   ├── public/
│   │   ├── uploads/               # User uploaded images
│   │   └── favicon.ico
│   │
│   ├── src/
│   │   ├── components/            # React components
│   │   │   ├── common/            # Reusable components
│   │   │   │   ├── Navbar.jsx
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   └── LoadingSpinner.jsx
│   │   │   │
│   │   │   ├── dashboard/         # Dashboard components
│   │   │   ├── credits/           # Credit management
│   │   │   ├── qr/                # QR code generation
│   │   │   ├── doctors/           # Doctor card management
│   │   │   └── admin/             # Admin panel
│   │   │
│   │   ├── pages/                 # Page components
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── QRGenerator.jsx
│   │   │   ├── DoctorCard.jsx
│   │   │   └── Credits.jsx
│   │   │
│   │   ├── context/               # React Context
│   │   │   └── AuthContext.jsx    # Authentication context
│   │   │
│   │   ├── hooks/                 # Custom hooks
│   │   │   ├── useAuth.js
│   │   │   └── useCredits.js
│   │   │
│   │   ├── services/              # API services
│   │   │   ├── api.service.js    # API calls
│   │   │   └── auth.service.js   # Auth services
│   │   │
│   │   ├── utils/                 # Utilities
│   │   │   ├── validation.js
│   │   │   └── helpers.js
│   │   │
│   │   ├── styles/                # CSS/Tailwind styles
│   │   ├── App.jsx                # Main component
│   │   ├── main.jsx               # Entry point
│   │   └── index.css              # Global styles
│   │
│   ├── .env                        # Environment variables
│   ├── index.html                  # HTML template
│   ├── vite.config.js              # Vite configuration
│   ├── tailwind.config.js          # Tailwind configuration
│   └── package.json                # Dependencies
│
├── client-ar-tick/                 # Frontend - AR Tick Detection
│   ├── public/
│   │   ├── opencv/                # OpenCV assets
│   │   │   ├── i_eat_while_distracted.mp4
│   │   │   ├── i_eat_in_a_hurry.mp4
│   │   │   ├── i_eat_mindfully.jpg
│   │   │   └── *.svg              # Icons and illustrations
│   │   └── favicon.ico
│   │
│   ├── src/
│   │   ├── components/            # React components
│   │   │   ├── MarkerDetectionVisualizer.jsx  # Camera & detection
│   │   │   ├── SquareDetector.jsx             # Square detection
│   │   │   └── common/                        # Reusable components
│   │   │
│   │   ├── pages/                 # Page components
│   │   │   ├── DocumentScanner.jsx
│   │   │   └── Result.jsx
│   │   │
│   │   ├── utils/                 # Utilities
│   │   │   ├── detectSquare.js    # Square detection logic
│   │   │   ├── cornerBlockDetector.js  # Corner detection
│   │   │   ├── cameraHelper.js    # Camera utilities
│   │   │   └── flashlight.js      # Flashlight control
│   │   │
│   │   ├── service/               # API services
│   │   │   └── api.service.js
│   │   │
│   │   ├── config/                # Configuration
│   │   │   └── axios.js
│   │   │
│   │   ├── App.jsx                # Main component
│   │   ├── main.jsx               # Entry point
│   │   └── index.css              # Global styles
│   │
│   ├── .env                        # Environment variables
│   ├── index.html                  # HTML template
│   ├── vite.config.js              # Vite configuration
│   └── package.json                # Dependencies
│
├── docker-compose.yml              # Docker configuration (optional)
├── .gitignore
└── README.md                       # This file
```

---

## 👥 User Roles & Hierarchy

```
Superadmin
    ↓
   Admin
    ↓
   TLM (Territory Lead Manager)
    ↓
   SLM (State Lead Manager)
    ↓
   FLM (Field Lead Manager)
    ↓
   MR (Medical Representative)
```

### Role Permissions

| Role | Permissions |
|------|------------|
| **Superadmin** | Full system access, user management, credit allocation |
| **Admin** | Manage TLMs, SLMs, FLMs, MRs, credit allocation |
| **TLM** | Allocate credits to SLMs, view reports |
| **SLM** | Allocate credits to FLMs, manage region |
| **FLM** | Allocate credits to MRs, manage field |
| **MR** | Generate QR codes, manage doctor cards |

---

## 🔄 How It Works

### Credit Flow

```
Superadmin → Allocates Credits → Admin
                                   ↓
Admin → Allocates Credits → TLM
                             ↓
TLM → Allocates Credits → SLM
                           ↓
SLM → Allocates Credits → FLM
                           ↓
FLM → Allocates Credits → MR
                           ↓
MR → Uses Credit → Generates QR → Creates Doctor Card
```

### QR Code Generation Flow

1. **MR logs in** to the system
2. **Checks available credits** in dashboard
3. **Fills doctor details** in form
4. **Clicks "Generate QR"** → Consumes 1 credit
5. **QR code is generated** and stored
6. **Doctor card is created** with the QR
7. **QR can be downloaded** as PNG
8. **Card can be shared** via link

### AR-Tick Detection Flow

1. **User scans QR** → Opens AR-Tick app
2. **Camera starts** → Shows live preview
3. **Card is placed** in frame
4. **Corner detection** → 4 corners identified
5. **Card is captured** → Auto-captured when stable
6. **Checkboxes analyzed** → Using OpenCV
7. **Results displayed** → Shows selected options
8. **Download option** → Save selected media

### Checkbox Detection Algorithm

```
1. Capture image → Warp to 600x1000
2. Extract checkbox band → All 3 checkboxes
3. Compute global threshold → Otsu on entire band
4. Measure each box → Using global threshold
5. Find baseline → Minimum fill percentage
6. Compare boxes → Fill - baseline >= margin
7. Return checked boxes → Fixed mapping (1,2,3)
```

---

## 📦 Installation Guide

### Prerequisites

```bash
# Install Node.js (v18+)
# Download from: https://nodejs.org/

# Install MongoDB (v6+)
# Download from: https://www.mongodb.com/try/download/community

# Install Git
# Download from: https://git-scm.com/downloads
```

### Step 1: Clone Repository

```bash
git clone https://github.com/yourusername/QR-Code-MERN-Project.git
cd QR-Code-MERN-Project
```

### Step 2: Install Backend Dependencies

```bash
cd server
npm install
```

### Step 3: Install Frontend Dependencies

```bash
# Business Card App
cd ../client-business-card
npm install

# AR-Tick App
cd ../client-ar-tick
npm install
```

### Step 4: Configure Environment Variables

#### Backend (.env)
Create `server/.env`:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/qr_management

# JWT
JWT_SECRET=your_super_secret_jwt_key_here

# API URL (for frontend)
VITE_API_URL=http://localhost:3000
VITE_S3_URL=http://localhost:3000

# Email Configuration (optional)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Cloudinary (for image upload)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

#### Frontend Business Card (.env)
Create `client-business-card/.env`:

```env
VITE_API_URL=http://localhost:3000
VITE_S3_URL=http://localhost:3000
```

#### Frontend AR-Tick (.env)
Create `client-ar-tick/.env`:

```env
VITE_API_URL=http://localhost:3000
VITE_S3_URL=http://localhost:3000
```

### Step 5: Start MongoDB

```bash
# Start MongoDB (Windows)
net start MongoDB

# Start MongoDB (macOS/Linux)
sudo systemctl start mongod
# OR
mongod --dbpath /path/to/data/db
```

### Step 6: Run the Application

#### Start Backend
```bash
cd server
npm run dev
# Server runs on http://localhost:3000
```

#### Start Business Card Frontend
```bash
cd client-business-card
npm run dev
# Runs on http://localhost:5173
```

#### Start AR-Tick Frontend
```bash
cd client-ar-tick
npm run dev
# Runs on http://localhost:5174 (or next available)
```

### Step 7: Access the Application

- **Business Card App**: http://localhost:5173
- **AR-Tick App**: http://localhost:5174
- **Backend API**: http://localhost:3000

---

## 🔐 Environment Variables

### Backend Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| PORT | Server port | No | 3000 |
| NODE_ENV | Environment mode | No | development |
| MONGODB_URI | MongoDB connection string | Yes | - |
| JWT_SECRET | JWT signing secret | Yes | - |
| VITE_API_URL | Backend API URL | Yes | - |
| VITE_S3_URL | S3/Static file URL | Yes | - |
| CLOUDINARY_CLOUD_NAME | Cloudinary cloud name | Optional | - |
| CLOUDINARY_API_KEY | Cloudinary API key | Optional | - |
| CLOUDINARY_API_SECRET | Cloudinary API secret | Optional | - |

### Frontend Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| VITE_API_URL | Backend API URL | Yes | http://localhost:3000 |
| VITE_S3_URL | S3/Static file URL | Yes | http://localhost:3000 |

---

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/auth/me` | Get current user |

### Credit Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/credits/balance` | Get credit balance |
| POST | `/api/credits/allocate` | Allocate credits |
| POST | `/api/credits/transfer` | Transfer credits |
| GET | `/api/credits/transactions` | Get transaction history |
| GET | `/api/credits/summary` | Get credit summary |

### QR Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/qr/generate` | Generate QR code |
| GET | `/api/qr/:id` | Get QR details |
| GET | `/api/qr/all` | Get all QR codes |
| PATCH | `/api/qr/assign/:id` | Assign QR to card |

### Doctor Card
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/doctor/create` | Create doctor card |
| GET | `/api/doctor/:id` | Get card details |
| PUT | `/api/doctor/:id` | Update card |
| DELETE | `/api/doctor/:id` | Delete card |
| GET | `/api/doctor/all` | Get all cards |

---

## 🖥️ Frontend Applications

### 1. Client Business Card

**Purpose**: Manage QR codes and business cards

**Key Pages**:
- **Login** - Authentication page
- **Dashboard** - Credit balance and summary
- **QR Generator** - Generate QR codes
- **Doctor Cards** - Create and manage cards
- **Credits** - View and manage credits
- **Transactions** - View transaction history

**Key Features**:
- Generate QR codes with 1 credit
- Create personalized doctor cards
- Upload and crop profile images
- Download QR codes as PNG
- View credit usage statistics
- Manage user profiles

### 2. Client AR-Tick

**Purpose**: Scan cards and detect selected options

**Key Pages**:
- **Scanner** - Camera-based detection
- **Result** - Display selected options

**Key Features**:
- Real-time corner detection
- Auto-capture when stable
- Checkbox analysis with OpenCV
- Global thresholding for accuracy
- Download selected media
- Debug mode for testing

**Detection Process**:
1. **Card Detection**: 4 corner markers identified
2. **Stabilization**: 3 stable frames required
3. **Image Capture**: Warped to 480x800
4. **Analysis**: Checkbox detection with OpenCV
5. **Results**: Fixed mapping to options

---

## 🚀 Deployment

### Deploy Backend to Render

1. **Push code to GitHub**

2. **Create Render account** at render.com

3. **Create New Web Service**:
   - Connect GitHub repository
   - Name: `your-backend-api`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`

4. **Add Environment Variables**:
   - MONGODB_URI
   - JWT_SECRET
   - VITE_API_URL
   - VITE_S3_URL

5. **Deploy**

### Deploy Frontend to Netlify

1. **Build the project**:
```bash
cd client-business-card
npm run build
# Creates 'dist' folder
```

2. **Deploy to Netlify**:
   - Drag `dist` folder to Netlify
   - OR use CLI: `netlify deploy --prod --dir=dist`

3. **Set Environment Variables**:
   - VITE_API_URL = https://your-backend.onrender.com

### Deploy AR-Tick Frontend

```bash
cd client-ar-tick
npm run build
# Deploy 'dist' folder to Netlify
```

---

## 🔧 Troubleshooting

### Common Issues & Solutions

#### 1. CORS Error
**Problem**: `Access-Control-Allow-Origin` header missing

**Solution**:
```javascript
// In server.js
app.use(cors({
  origin: ['http://localhost:5173', 'https://your-frontend.com'],
  credentials: true,
}));
```

#### 2. MongoDB Connection Error
**Problem**: `MongoNetworkError` or connection refused

**Solutions**:
```bash
# Start MongoDB
mongod --dbpath /data/db

# Check status
sudo systemctl status mongod

# Restart MongoDB
sudo systemctl restart mongod
```

#### 3. Port Already in Use
**Problem**: `EADDRINUSE` error

**Solutions**:
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 [PID]

# Or change port in .env
PORT=3001
```

#### 4. OpenCV.js Loading Issues
**Problem**: OpenCV not loading in AR-Tick

**Solutions**:
```html
<!-- Use CDN fallback -->
<script src="https://docs.opencv.org/4.5.0/opencv.js"></script>
<script src="https://cdn.jsdelivr.net/npm/opencv.js@4.5.0/opencv.min.js"></script>
```

#### 5. Image Upload Fails
**Problem**: Multer error or file size limit

**Solutions**:
```javascript
// Increase limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Multer config
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});
```

### Debug Mode

#### Enable Backend Debugging
```bash
# Run with debug
NODE_ENV=development nodemon server.js

# Enable logging
DEBUG=express:* npm start
```

#### Enable Frontend Debugging
```javascript
// In browser console
localStorage.setItem('debug', 'true');

// Or in code
const DEBUG = import.meta.env.DEV;

// Show debug panel (AR-Tick)
const showDebug = true; // Toggle in SquareDetector.jsx
```

---

## 🤝 Contributing

### Development Workflow

1. **Fork the repository**

2. **Create a feature branch**:
```bash
git checkout -b feature/your-feature-name
```

3. **Make changes** and commit:
```bash
git add .
git commit -m "Description of changes"
```

4. **Push to GitHub**:
```bash
git push origin feature/your-feature-name
```

5. **Create Pull Request**

### Code Style Guidelines

#### Backend
- Use ES6+ syntax
- Use async/await over callbacks
- Validate all inputs
- Handle errors properly
- Write meaningful comments

#### Frontend
- Use functional components
- Use React Hooks
- Use Tailwind classes
- Keep components small and focused
- Use proper prop validation

---

## 📚 Additional Resources

### Documentation
- [MongoDB Docs](https://docs.mongodb.com/)
- [Express.js Docs](https://expressjs.com/)
- [React Docs](https://reactjs.org/)
- [Tailwind CSS Docs](https://tailwindcss.com/)
- [OpenCV.js Docs](https://docs.opencv.org/4.5.0/)

### Tools Used
- **Postman** - API testing
- **MongoDB Compass** - Database management
- **VS Code** - Development IDE
- **Git** - Version control
- **ngrok** - Local tunnel for testing

---

## 📝 License

This project is proprietary and confidential.

---

## 👨‍💻 Author

**Sagar Sharma** (@digi-webdev2)  
Built during internship at [digilateral.com](https://digilateral.com)

---

## 🙏 Acknowledgments

- Digilateral team for mentorship
- OpenCV community for computer vision tools
- React and Node.js communities

---

## 🎯 Quick Start Commands

```bash
# Clone and install
git clone https://github.com/yourusername/QR-Code-MERN-Project.git
cd QR-Code-MERN-Project

# Backend
cd server
npm install
npm run dev

# Business Card Frontend
cd ../client-business-card
npm install
npm run dev

# AR-Tick Frontend
cd ../client-ar-tick
npm install
npm run dev

# Access apps
# Business Card: http://localhost:5173
# AR-Tick: http://localhost:5174
# API: http://localhost:3000
```

---

**Happy Coding! 🚀**
