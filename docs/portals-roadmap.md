# KSJ Digital Portals Roadmap

## Repository

`KSJHub/KSJDigital`

## Current Portal Status

### Authentication

- Portal Login Page
- Session System
- Owner Login
- Client Login Foundation
- Protected Routes
- Logout System

### Portal Structure

- Client Dashboard
- My Website
- Drafts
- Publish Requests
- Support
- Account

### Admin Structure

- Client Management
- Websites Page
- Publish Requests Page
- Settings Page
- Client View

## Client Management Status

Completed:

- Create User
- Edit User
- Delete User
- Disable User
- Enable User
- Multiple Website Assignment
- Website Access Dropdown
- Role Descriptions
- Permission Descriptions
- Dynamic Selection Details Panel
- User Table
- Create Mode
- Edit Mode
- Role Capitalisation
- Assigned Website Counts
- Cleaner Navigation
- Removed duplicate Users/Admin pages
- Renamed to Client Management

## Current Roles

### Owner

Full KSJ Digital access, all websites, all users, all requests, all settings, and full management.

### Website Manager

Internal KSJ staff role for assigned websites only, small content edits, image changes, draft support, and no user management.

### Support Agent

Handles tickets, support requests, client messages, and request responses. No website editing.

### Client Administrator

Highest client role. Can edit text, edit images, create drafts, upload media, and submit publish requests.

### Content Editor

Limited content editing, images, products, prices, and drafts only. No publishing.

### Viewer

Read-only access with no editing.

## Website Management System

Current:

- Website Listing
- Website Cards
- User Assignment Counts

Needs building:

- Create Website
- Edit Website
- Delete / Disable Website
- Website Settings
- Website Status
- Domain Settings
- Publish Mode
- Website Owners
- Website Access Permissions
- Website Analytics
- Website Storage Usage
- 48-Hour Restore Backup

## 48-Hour Restore Backup System

When a client publishes edits, KSJ Digital Portals should keep a temporary restore backup of the previous live version for 48 hours.

### Backup Flow

1. Client submits or publishes approved edits.
2. The current live website version is stored as a temporary backup.
3. The new edited version becomes the live copy on the VPS.
4. The previous version can be restored for 48 hours if the client or KSJ staff spots an error.
5. After 48 hours, the temporary backup expires and is permanently deleted.
6. Only one live website copy should exist on the VPS.
7. A temporary backup should only exist after a publish action and only until it expires.

### Client Warning

Clients must be clearly warned before publishing:

> A restore backup is kept for 48 hours after publishing. After 48 hours, the backup is permanently deleted and cannot be recovered.

### Backend Requirements Later

- Backup timestamp
- Backup expiry timestamp
- Restore action
- Expired backup cleanup
- Restore logs
- Publish logs
- Staff/owner visibility
- Client-facing warning banner

## Publish Requests

Current:

- Placeholder Page

Needs building:

- Publish Queue
- Pending Requests
- Approved Requests
- Rejected Requests
- Request Details
- Change History
- Approval Workflow
- Website Manager Approval
- Owner Approval
- Publish Logs

## Support System

Current:

- Placeholder Page

Needs building:

- Support Tickets
- Ticket Creation
- Ticket Replies
- Internal Notes
- File Uploads
- Ticket Status
- Ticket Assignment
- Support Agent Dashboard
- Client Messaging
- Notifications

## Draft System

Current:

- Placeholder Page

Needs building:

- Draft Storage
- Draft Versions
- Draft Review
- Draft Approval
- Draft Comparison
- Publish From Draft
- Revert Draft

## Content Management System

Goal: allow clients to edit content without editing layouts.

Editable:

- Homepage Text
- Hero Sections
- About Page Content
- Contact Details
- Social Links
- Images
- Product Information
- Prices
- Team Members
- Testimonials
- FAQ Content

Locked:

- Layouts
- Components
- Styling
- Branding
- Code

## Account Page

Current:

- Account Overview
- Role Display
- Access Display

Needs building:

- Change Password
- 2FA
- Security Settings
- Login History
- Session Management
- Email Preferences

## Backend Phase

Everything currently runs as frontend session state.

Next backend stage:

- Database
- User Persistence
- Website Persistence
- Draft Persistence
- Publish Persistence
- Ticket Persistence
- Authentication Backend
- Password Hashing
- Email Invites
- Password Reset

## Next Priority Order

1. Website Management System
2. Support Ticket System
3. Publish Request System
4. Content Management System
5. Database Integration
6. Authentication Hardening

## Long-Term Vision

KSJ Digital should become a professional managed website platform where clients can log in, edit approved content, upload media, save drafts, submit publish requests, and contact support.

Staff should be able to manage websites, review drafts, approve publishes, and support clients.

The owner should be able to manage everything, control permissions, manage users, manage publishing, and view analytics.
