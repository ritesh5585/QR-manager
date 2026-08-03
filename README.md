# QR-Code-MERN-Project 🧾⚡

A full-stack MERN (MongoDB, Express, React, Node.js) web application for managing QR codes and credits in a hierarchical organization — ideal for sales or medical reps generating QR-based business cards.

---

## 🔧 Features

- 🔐 **User Hierarchy**: Superadmin → Admin → TLM → SLM → FLM → MR
- 💰 **Credits Management**: Allocate, issue, reclaim, and track credits across the hierarchy
- 🧾 **QR Code Generator**: Generate unique QR codes using credits
- 🗂️ **Doctor Card System**: Each QR leads to a personalized doctor business card (form + visual template) or ar-tick detection system
- 📅 **Expiry Management**: Auto-handle credit & QR expiries
- 📊 **Transaction Logs**: Filterable logs for all credit-related actions
- 🖼️ **Image Cropper**: Upload and crop images for doctor profiles
- 📱 **Mobile-Responsive UI**: Clean layout with sidebar + header system

---

## 🚀 Tech Stack

- **Frontend**: React + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: MongoDB (Mongoose)
- **Others**: QR Code Generator, React Image Crop, Excel Upload/Export, Axios

---

## 🧑‍💼 User Roles

| Role        | Permissions                            |
|-------------|-----------------------------------------|
| Superadmin  | Full control over system and credits    |
| Admin       | Manage all TLM, SLM, FLM, MR and credits                 |
| TLM / SLM / FLM | Allocate or use credits down the chain |
| MR (Field Level) | Only generate and assign QR codes using credits |

---

## 📂 Folder Structure (Simplified)

QR-Code-MERN-Project/  
├── client-business-card/    # React + Vite Frontend  
├── client-ar-tick/          # React + Vite Frontend     
├── server/                  # Node.js Backend  
└── README.md

---

## 🛠️ Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/digilateral/QR-Code-MERN-Project.git
cd QR-Code-MERN-Project
```
### 2. Install dependencies
Backend:
```bash
cd server
npm install
```
Frontend:
```bash
cd ../client-business-card
npm install
```

Frontend:
```bash
cd ../client-ar-tick
npm install
```
### 3. Run the app

# Start backend
```bash
cd server
npm run dev
```

# Start frontend (in another terminal)
```bash
cd ../client-business-card
npm run dev
```
# Start frontend (in another terminal)
```bash
cd ../client-ar-tick
npm run dev
```

🧑‍💻 Author
Sagar Sharma (@digi-webdev2)  
Built during internship at digilateral.com