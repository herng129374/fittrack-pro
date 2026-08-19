# FitTrack Pro

**A Mobile App for Next-Gen Coaching and Fitness Class Management**

Final Year Project (Bachelor of Information Systems, Business Information Systems) — Universiti Tunku Abdul Rahman (UTAR)
By Soon Chau Herng | Supervisor: Wong Pei Voon

---

## 📌 Overview

FitTrack Pro is an integrated mobile platform built for independent fitness coaches and their clients. Most freelance trainers and boutique studios still rely on fragmented tools — spreadsheets, WhatsApp, and paper records — to manage schedules, track client progress, and stay connected with their community.

FitTrack Pro replaces that fragmentation with a single app that combines:
- **Real-time class scheduling & attendance**, replacing manual booking with a "click to join" system
- **AI-driven coaching**, with a chatbot assistant and automated health reports (BMI tracking, calorie estimates)
- **A social-first community**, inspired by the visual, interactive feel of Instagram and Xiaohongshu, rather than the outdated forum-style community features found in existing fitness apps

The project benchmarks itself against three existing platforms — **Glofox**, **Mindbody**, and **Virtuagym** — and is designed to address specific gaps identified in each (see [Literature Review](#background) below).

---

## ✨ Key Features

| Module | Description |
|---|---|
| **Real-Time Scheduling** | Coaches create/update class schedules live; clients book with instant confirmation and automated attendance tracking |
| **AI Coaching Assistant** | In-app chatbot (powered by Google Gemini API) answers fitness/nutrition questions and generates personalised health insights |
| **Gamified Progress Tracking** | Daily task check-ins earn tokens, redeemable in an in-app marketplace |
| **Social Community** | Users follow each other, share posts/progress, join communities, and message coaches or peers directly |
| **Role-Based Access** | Three distinct interfaces — **User**, **Coach**, and **Admin** — each with tailored permissions |
| **Admin Dashboard** | Manage marketplace inventory, user roles, and course catalogues from a centralised panel |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | Expo (React Native), TypeScript |
| Web Admin Dashboard | Next.js |
| Backend / AI Proxy | Node.js (secures API keys, mediates AI requests) |
| Database & Auth | Firebase (Authentication + real-time database) |
| AI | Google Gemini API |
| Design & Prototyping | Figma |
| Version Control | Git / GitHub |

---

## 🏗️ System Architecture

The app follows a three-module architecture:

- **User/Coach Client** — handles course browsing, booking, chat, community, and profile management
- **Admin Dashboard** — manages platform data, courses, and marketplace inventory
- **AI Backend** — isolated Node.js layer that proxies requests to the Google Gemini API, keeping API keys and user credentials out of the client app

This separation ensures sensitive credentials never ship inside the mobile app bundle, and keeps AI logic swappable/upgradable independent of the front end.

Core data model includes seven main classes: `User` (base entity, extended by `Coach` and `AdminUser`), `Course`, `CourseEnrollment`, `Booking`, `Task`, and `HealthMetric` — supporting everything from class enrolment to AI-generated health reporting.

---

## 📱 Screenshots

*(Add screenshots here — e.g. Login/Register, Home dashboard, Course booking, Community feed, Admin dashboard. Drag image files directly into this README on GitHub's web editor, or reference them from an `/assets` folder.)*

---

## 🎯 Project Objectives

1. Implement real-time scheduling and automated attendance tools to eliminate double-bookings and manual tracking errors
2. Provide AI-driven progress tracking with personalised health insights (BMI, calorie estimates, monthly summaries)
3. Build a social-first community platform that keeps coaches and clients engaged beyond the transactional booking relationship

---

## 📖 Background

This project was developed after benchmarking three established platforms in the fitness-tech space:

- **Glofox** — strong financial automation and brand-building tools, but limited personalisation and heavy reliance on external tools like WhatsApp for communication
- **Mindbody** — the most feature-complete all-in-one system, but data is largely financial/operational rather than AI-driven or client-progress focused
- **Virtuagym** — strong health & nutrition tracking, but an outdated, text-heavy community experience that fails to drive engagement

FitTrack Pro's contribution is combining the strongest elements of each — automation, AI-driven insight, and modern social UX — into a single, coach-centric platform.

---

## ⚠️ Current Limitations

This is an academic FYP prototype, not a production system. Known limitations:

- AI assistant runs on Google Gemini's free tier, so it's subject to rate limits under heavy use
- No native wearable device integration (e.g. Apple Watch, Fitbit) yet
- Marketplace uses a simulated token economy — no real payment gateway integration
- Not yet tested at scale / not deployed for public production use

## 🔭 Future Work

- Integrate wearable device data (heart rate, step count) for more accurate health metrics
- Complete the admin dashboard for full business-decision support
- Move to a paid AI tier or self-hosted LLM to remove rate-limit constraints

---

## 👤 Author

**Soon Chau Herng**
Bachelor of Information Systems (Honours), Business Information Systems — UTAR
📧 herng0726@1utar.my
