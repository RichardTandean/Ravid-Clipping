# User Flows

This document details the various user journeys through the Ravid Clipping platform.

## 1. New User Registration

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant UserService
    participant Database
    
    User->>Frontend: Visits landing page
    User->>Frontend: Clicks "Sign Up"
    Frontend->>Frontend: Display registration form
    User->>Frontend: Fills form (email, password)
    Frontend->>UserService: POST /api/auth/register
    UserService->>Database: Create user record
    Database-->>UserService: Confirm creation
    UserService-->>Frontend: Return JWT token
    Frontend->>Frontend: Store token
    Frontend->>Frontend: Redirect to dashboard
```

### Success Criteria
- User account created
- JWT token received
- Redirected to dashboard
- Welcome email sent

## 2. Token Purchase Flow

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant BillingService
    participant PaymentGateway
    participant Database
    
    User->>Frontend: Views token packages
    User->>Frontend: Selects package
    Frontend->>BillingService: POST /api/tokens/purchase
    BillingService->>PaymentGateway: Create payment
    PaymentGateway-->>BillingService: Payment URL
    BillingService-->>Frontend: Redirect to payment
    User->>PaymentGateway: Completes payment
    PaymentGateway->>BillingService: Payment webhook
    BillingService->>Database: Credit tokens
    BillingService-->>Frontend: Success notification
    Frontend->>Frontend: Update token display
```

### Success Criteria
- Payment processed
- Tokens credited
- Balance updated
- Receipt email sent

## 3. Video Processing Flow

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant VideoService
    participant Storage
    participant Worker
    participant Database
    
    User->>Frontend: Pastes YouTube URL
    Frontend->>VideoService: POST /api/videos/process
    VideoService->>Database: Check token balance
    Database-->>VideoService: Balance OK
    VideoService->>Storage: Generate upload URL
    Storage-->>VideoService: Signed URL
    VideoService-->>Frontend: Return upload URL
    Frontend->>Storage: Upload video
    Storage-->>Frontend: Upload complete
    Frontend->>VideoService: Start processing
    VideoService->>Worker: Queue job
    Worker->>Worker: Process video
    Worker->>Storage: Save clips
    Worker->>Database: Update status
    Frontend->>VideoService: Poll status
    VideoService-->>Frontend: Job complete
    Frontend->>Frontend: Show results
```

### Success Criteria
- Video uploaded
- Processing started
- Clips generated
- Results displayed

## 4. Clip Management Flow

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant VideoService
    participant Storage
    
    User->>Frontend: Views clip library
    Frontend->>VideoService: GET /api/videos
    VideoService->>Storage: Generate clip URLs
    VideoService-->>Frontend: Return clips list
    Frontend->>Frontend: Display grid view
    User->>Frontend: Previews clip
    Frontend->>Storage: Stream clip
    User->>Frontend: Downloads clip
    Frontend->>Storage: Download clip
```

### Success Criteria
- Clips listed
- Preview works
- Download works
- Sharing enabled

## 5. Account Management Flow

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant UserService
    participant Database
    
    User->>Frontend: Views profile
    Frontend->>UserService: GET /api/users/me
    UserService->>Database: Fetch user data
    Database-->>UserService: Return data
    UserService-->>Frontend: Display profile
    User->>Frontend: Updates profile
    Frontend->>UserService: PUT /api/users/me
    UserService->>Database: Update record
    Database-->>UserService: Confirm update
    UserService-->>Frontend: Success message
```

### Success Criteria
- Profile viewable
- Updates saved
- History visible
- Settings applied

## 6. Error Handling Flows

### Token Depletion

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant VideoService
    participant Database
    
    User->>Frontend: Attempts upload
    Frontend->>VideoService: POST /api/videos/process
    VideoService->>Database: Check balance
    Database-->>VideoService: Insufficient tokens
    VideoService-->>Frontend: 403 Forbidden
    Frontend->>Frontend: Show "Buy Tokens"
```

### Processing Failure

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant VideoService
    participant Worker
    
    User->>Frontend: Uploads video
    Frontend->>VideoService: Start processing
    VideoService->>Worker: Queue job
    Worker-->>VideoService: Processing error
    VideoService-->>Frontend: Error status
    Frontend->>Frontend: Show retry option
```

## 7. Social Sharing Flow

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant VideoService
    participant SocialPlatform
    
    User->>Frontend: Selects clip
    User->>Frontend: Clicks "Share"
    Frontend->>Frontend: Show platforms
    User->>Frontend: Picks platform
    Frontend->>VideoService: GET share URL
    VideoService-->>Frontend: Return URL
    Frontend->>SocialPlatform: Open share dialog
    User->>SocialPlatform: Confirms share
```

### Success Criteria
- Platforms available
- Share dialog works
- Links valid
- Analytics tracked

## Key User Interactions

### Dashboard Elements
- Token balance display
- Recent videos grid
- Processing status
- Quick actions menu

### Video Upload
- URL input field
- Progress indicator
- Status updates
- Error messages

### Clip Management
- Thumbnail preview
- Duration display
- Download button
- Share options

### Account Settings
- Profile details
- Payment methods
- Email preferences
- API access

## Success Metrics

### User Engagement
- Sign-up completion rate
- Token purchase rate
- Video processing rate
- Clip download rate

### Technical Performance
- Upload success rate
- Processing success rate
- Average processing time
- Error rate

### Business Metrics
- User retention
- Token consumption
- Revenue per user
- Platform growth 