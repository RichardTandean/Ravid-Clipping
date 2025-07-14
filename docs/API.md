# API Documentation

## Base URLs

- **User Service**: `http://localhost:8001`
- **Video Service**: `http://localhost:8002`
- **Billing Service**: `http://localhost:8003`

All API endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## User Service API

### Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}
```

Response:
```json
{
  "token": "jwt_token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "createdAt": "timestamp"
  }
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}
```

Response:
```json
{
  "token": "jwt_token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "tokenBalance": 10
  }
}
```

### User Management

#### Get User Profile
```http
GET /api/users/me
```

Response:
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "tokenBalance": 10,
  "createdAt": "timestamp",
  "stats": {
    "totalVideos": 5,
    "totalClips": 15
  }
}
```

## Video Service API

### Video Processing

#### Initialize Video Upload
```http
POST /api/videos/init-upload
Content-Type: application/json

{
  "filename": "video.mp4",
  "fileSize": 15000000
}
```

Response:
```json
{
  "uploadUrl": "presigned_url",
  "videoId": "uuid"
}
```

#### Start Processing
```http
POST /api/videos/{videoId}/process
Content-Type: application/json

{
  "youtubeUrl": "https://youtube.com/watch?v=...",
  "preferences": {
    "minClipDuration": 15,
    "maxClipDuration": 60,
    "captionStyle": "tiktok"
  }
}
```

Response:
```json
{
  "jobId": "uuid",
  "status": "queued",
  "estimatedTime": 300
}
```

#### Get Job Status
```http
GET /api/jobs/{jobId}
```

Response:
```json
{
  "jobId": "uuid",
  "status": "processing",
  "progress": 45,
  "clips": [
    {
      "id": "uuid",
      "status": "completed",
      "duration": 30,
      "downloadUrl": "url",
      "thumbnail": "url"
    }
  ]
}
```

#### List User Videos
```http
GET /api/videos
```

Response:
```json
{
  "videos": [
    {
      "id": "uuid",
      "originalUrl": "youtube_url",
      "status": "completed",
      "createdAt": "timestamp",
      "clips": [
        {
          "id": "uuid",
          "duration": 30,
          "downloadUrl": "url",
          "thumbnail": "url"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "totalPages": 5,
    "totalItems": 50
  }
}
```

## Billing Service API

### Token Management

#### Get Token Packages
```http
GET /api/tokens/packages
```

Response:
```json
{
  "packages": [
    {
      "id": "basic",
      "tokens": 10,
      "price": 10000,
      "currency": "IDR"
    },
    {
      "id": "pro",
      "tokens": 50,
      "price": 45000,
      "currency": "IDR"
    }
  ]
}
```

#### Purchase Tokens
```http
POST /api/tokens/purchase
Content-Type: application/json

{
  "packageId": "basic",
  "paymentMethod": "midtrans"
}
```

Response:
```json
{
  "transactionId": "uuid",
  "paymentUrl": "payment_gateway_url",
  "amount": 10000,
  "tokens": 10
}
```

#### Get Token Balance
```http
GET /api/tokens/balance
```

Response:
```json
{
  "balance": 10,
  "transactions": [
    {
      "id": "uuid",
      "type": "purchase",
      "amount": 10,
      "timestamp": "date"
    },
    {
      "id": "uuid",
      "type": "usage",
      "amount": -1,
      "videoId": "uuid",
      "timestamp": "date"
    }
  ]
}
```

## Error Responses

All endpoints may return the following error responses:

### 401 Unauthorized
```json
{
  "error": "unauthorized",
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "error": "forbidden",
  "message": "Insufficient token balance"
}
```

### 404 Not Found
```json
{
  "error": "not_found",
  "message": "Resource not found"
}
```

### 422 Validation Error
```json
{
  "error": "validation_error",
  "message": "Invalid input",
  "details": {
    "field": ["error message"]
  }
}
```

### 500 Server Error
```json
{
  "error": "server_error",
  "message": "Internal server error"
}
``` 