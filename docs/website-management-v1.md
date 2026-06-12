# Website Management System v1

## Purpose

The Website Management System is the foundation of KSJ Digital Portals.

Every future system will attach to a website record:

- Support Tickets
- Publish Requests
- Drafts
- Analytics
- Content Management
- Storage Usage
- Backups
- Permissions

## Website Record Structure

```json
{
  "id": "website_001",
  "name": "TwoToneTaj",
  "subdomain": "twotonetaj.ksjdigital.co.uk",
  "customDomain": "",
  "status": "active",
  "publishMode": "approval_required",
  "owners": [],
  "editors": [],
  "storageUsed": 0,
  "createdAt": "",
  "updatedAt": ""
}
```

## Website Status Values

- Active
- Maintenance
- Suspended
- Archived

## Publish Modes

### Approval Required

Client submits changes.
Website Manager or Owner approves publication.

### Direct Publish

Changes can be published immediately.

## Initial Features

- Create Website
- Edit Website
- Disable Website
- Delete Website
- Assign Owners
- Assign Users
- Domain Settings
- Status Management
- Publish Mode Management

## Future Features

- Analytics
- Storage Tracking
- Website Activity Logs
- Backup Management
- Content Permissions
- Media Library
- Revision History

## Portal Goal

Provide a Shopify-style management experience while keeping layouts, branding, styling, and source code fully controlled by KSJ Digital.
