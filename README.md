# Personas - Campus Threads for COMSATS (Previous name -> ThreadSATS)

A private, anonymous-first social platform built exclusively for **COMSATS University** students.

### What is Personas?
Personas is your campus's own digital space — where students can:
- Post threads **publicly** or **anonymously**
- Share knowledge, memes, complaints, and campus drama
- Connect with batchmates and department mates
- Chat privately (DMs) using public or anonymous personas
- Discover what's trending on campus in real time

It's designed to feel like a mix of **Instagram + Reddit + Twitter/X**, but made specifically for the COMSATS community — with strong focus on **anonymity**, **batch relevance**, and **campus culture**.

### ✨ Key Features

- **Dual Persona System**
  - Switch seamlessly between Public and Anonymous mode
  - Each user has a separate anonymous identity
  - Full anonymity when posting, commenting, or replying

- **Smart Feeds**
  - **For You** — Personalized feed based on interactions and campus relevance
  - **Following** — Posts from people you follow
  - **Departmental Batch** — Content from your department and batch year

- **Engagement**
  - Like, comment, repost, and quote repost
  - Trending page with campus hot topics

- **Social Features**
  - Profile pages with bio, posts, and followers
  - Search users
  - Direct Messages (DMs) with persona support
  - Suggested users to follow

- **UI/UX**
  - Clean, modern interface
  - Light & Dark mode support

### Tech Stack

- **Frontend**: React (with plans to go React Native for mobile)
- **Backend**: Node.js + Express
- **Database**: MongoDB
- **Authentication**: JWT + COMSATS email verification
- **Deployment**: Vercel (Frontend) + Render/Railway (Backend)

### Project Status

- Authentication (Sign up / Login / Logout)
- Public ↔ Anonymous persona switching
- Thread creation (with images)
- Interactions (like, comment, repost, quote)
- Profile system + following
- Multiple feeds (For You, Following, Batch)
- Search & Suggested users
- Notifications
- Direct Messages (DMs)
- Trending page
- Feed Algorithm (recently added)
- Paywall / Premium features (in progress)
- Medal gifting & redemption system (planned post-deployment)

### Future Plans

- Mobile app (React Native)
- Premium subscription (anonymous posting, profile views, etc.)
- Medal / virtual gifting system with real payouts
- Events & Ads section for societies and students
- Improved personalization and batch-level features

### How to Run through Docker

docker compose up -d
or 
docker-compose up -d

### How to Run Locally

```bash
# Clone the repository
git clone https://github.com/yourusername/threadSATS.git
cd threadSATS

# Backend
cd backend
npm install
npm run dev

# Frontend (in new terminal)
cd frontend
npm install
npm start
