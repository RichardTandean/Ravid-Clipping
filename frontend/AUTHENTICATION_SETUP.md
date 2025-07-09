# 🚀 Video Clipper Authentication & Payment System Setup

This guide will help you set up the complete authentication and monetization system for your Video Clipper application.

## 📋 Overview

The system includes:
- **Authentication**: Supabase-powered login, registration, and password reset
- **Coin System**: Virtual currency for pay-per-use video processing
- **Payment Integration**: Indonesian payment gateways (Midtrans recommended)
- **User Management**: Profile, transaction history, and balance tracking

## 🔧 Setup Instructions

### 1. Supabase Setup

#### Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note down your project URL and anon key
3. Go to SQL Editor in your Supabase dashboard
4. Run the entire `supabase-schema.sql` file to create all tables and policies

#### Configure Authentication
1. In Supabase Dashboard → Authentication → Settings
2. Enable email confirmations (recommended)
3. Set up email templates for better user experience
4. Configure redirect URLs for password reset

#### Configure Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client IDs
5. Set authorized redirect URIs:
   - `https://[YOUR_SUPABASE_PROJECT].supabase.co/auth/v1/callback`
   - `http://localhost:3000/auth/callback` (for development)
6. Copy the Client ID and Client Secret
7. In Supabase Dashboard → Authentication → Providers
8. Enable Google provider and add your Client ID and Client Secret

### 2. Environment Variables

Create a `.env.local` file in your frontend directory:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Payment Gateway (Midtrans example)
MIDTRANS_SERVER_KEY=your_midtrans_server_key
MIDTRANS_CLIENT_KEY=your_midtrans_client_key
MIDTRANS_IS_PRODUCTION=false

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Payment Gateway Setup (Midtrans)

#### Register for Midtrans
1. Visit [midtrans.com](https://midtrans.com)
2. Register for a business account
3. Complete KYC verification
4. Get your Server Key and Client Key from the dashboard

#### Midtrans Configuration
- **Sandbox**: Use for testing (free)
- **Production**: Requires business verification
- **Webhook URL**: Set to `https://yourdomain.com/api/payment/webhook`

## 💰 Coin System

### Pricing Structure
- **Generate Clips**: 1,000 coins
- **Download Clips**: Video length (seconds) × 10 coins
- **AI Analysis Bonus**: +4,000 coins

### Coin Packages
- **Starter Pack**: 5,000 coins - Rp 50,000
- **Popular Pack**: 12,000 coins - Rp 100,000 (+20% bonus)
- **Premium Pack**: 30,000 coins - Rp 250,000 (+50% bonus)

### Free Credits
- New users get 5,000 coins welcome bonus
- Enough for 5 basic video generations or 1 with AI analysis

## 🔐 Security Features

### Row Level Security (RLS)
- All user data is protected by Supabase RLS policies
- Users can only access their own coins, transactions, and history

### Transaction Audit Trail
- All coin transactions are logged with timestamps
- Payment transactions stored with gateway responses
- Video processing history tracked for analytics

## 🎨 UI Components

### Authentication Components
- **LoginModal**: Email/password login + forgot password
- **RegisterModal**: Registration with email confirmation
- **Header**: User profile and authentication controls

### Coin System Components
- **CoinDisplay**: Shows balance and top-up button
- **CoinContext**: Manages coin operations and state
- **Cost Indicators**: Real-time cost display on upload forms

## 🛠 Backend Integration

### Required API Endpoints
You'll need to update your backend to:

1. **Accept user authentication**
```javascript
// Verify Supabase JWT token
const token = req.headers.authorization?.replace('Bearer ', '')
const { user } = await supabase.auth.getUser(token)
```

2. **Handle coin deduction**
```javascript
// Verify sufficient coins before processing
// Deduct coins after successful processing
// Log transaction for audit trail
```

3. **Payment webhook**
```javascript
// Handle Midtrans payment notifications
// Update user coin balance
// Send confirmation email
```

## 📱 Indonesian Payment Methods

### Midtrans Supported Methods
- **Bank Transfer**: BCA, Mandiri, BRI, BNI
- **E-Wallets**: OVO, GoPay, DANA, LinkAja
- **Credit/Debit Cards**: Visa, Mastercard
- **Convenience Stores**: Alfamart, Indomaret

### Payment Flow
1. User selects coin package
2. Redirected to Midtrans payment page
3. Completes payment via preferred method
4. Webhook updates coin balance
5. User receives confirmation

## 🚀 Deployment Checklist

### Environment Setup
- [ ] Supabase project created and configured
- [ ] Database schema deployed
- [ ] Environment variables set
- [ ] Payment gateway credentials configured

### Authentication Testing
- [ ] User registration works
- [ ] Email confirmation functional
- [ ] Login/logout working
- [ ] Password reset functional

### Coin System Testing
- [ ] New user bonus credited
- [ ] Coin deduction working
- [ ] Insufficient funds handled
- [ ] Transaction history accurate

### Payment Testing
- [ ] Midtrans sandbox integration
- [ ] Webhook handling
- [ ] Coin top-up working
- [ ] Payment confirmation emails

## 🔧 Development Commands

```bash
# Install dependencies
npm install @supabase/supabase-js

# Run development server
npm run dev

# Build for production
npm run build
```

## 🌐 Production Considerations

### Security
- Use HTTPS only in production
- Secure environment variables
- Enable Supabase RLS policies
- Validate all payment webhooks

### Monitoring
- Set up error tracking (Sentry)
- Monitor payment success rates
- Track user conversion metrics
- Log suspicious activities

### Scaling
- Consider coin balance caching
- Implement rate limiting
- Use CDN for static assets
- Monitor database performance

## 📞 Support & Troubleshooting

### Common Issues
1. **"User not authenticated"**: Check JWT token validation
2. **"Insufficient coins"**: Verify coin balance calculation
3. **Payment fails**: Check Midtrans webhook configuration
4. **Email not received**: Verify Supabase email settings

### Getting Help
- Supabase: [docs.supabase.com](https://docs.supabase.com)
- Midtrans: [docs.midtrans.com](https://docs.midtrans.com)
- Next.js: [nextjs.org/docs](https://nextjs.org/docs)

## 🎯 Next Steps

1. **Set up Supabase project and run the SQL schema**
2. **Configure environment variables**
3. **Test authentication flow**
4. **Integrate payment gateway**
5. **Deploy to production**

Your Video Clipper is now ready for monetization! 🎉 