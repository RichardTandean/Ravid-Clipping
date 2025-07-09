# Cloudflare Setup Guide for Video Clipping Platform

This guide walks you through setting up Cloudflare for your video clipping platform domain.

## Prerequisites

- A domain name registered and managed through Cloudflare
- Access to your Cloudflare dashboard
- Your VPS public IP address

## 1. DNS Configuration

### A. Main Domain Records

In your Cloudflare DNS settings, add the following records:

```
Type: A
Name: @
Content: YOUR_VPS_IP_ADDRESS
Proxy status: ✅ Proxied
TTL: Auto

Type: A
Name: www
Content: YOUR_VPS_IP_ADDRESS
Proxy status: ✅ Proxied
TTL: Auto

Type: A
Name: admin
Content: YOUR_VPS_IP_ADDRESS
Proxy status: ✅ Proxied
TTL: Auto
```

### B. API Subdomain (Optional)
If you want a separate API subdomain:

```
Type: A
Name: api
Content: YOUR_VPS_IP_ADDRESS
Proxy status: ✅ Proxied
TTL: Auto
```

## 2. SSL/TLS Configuration

### A. SSL/TLS Settings

1. Go to **SSL/TLS** → **Overview**
2. Set encryption mode to **Full (strict)**
3. This ensures end-to-end encryption between Cloudflare and your server

### B. Edge Certificates

1. Go to **SSL/TLS** → **Edge Certificates**
2. Enable the following:
   - ✅ Always Use HTTPS
   - ✅ HTTP Strict Transport Security (HSTS)
   - ✅ Minimum TLS Version: 1.2
   - ✅ Opportunistic Encryption
   - ✅ TLS 1.3

### C. Origin Certificates (Recommended)

For maximum security, use Cloudflare Origin Certificates:

1. Go to **SSL/TLS** → **Origin Server**
2. Click **Create Certificate**
3. Choose:
   - Let Cloudflare generate a private key and a CSR
   - Hostnames: `*.yourdomain.com, yourdomain.com`
   - Certificate Validity: 15 years
4. Copy the certificate and private key
5. Save them to your VPS at:
   - `/etc/ssl/certs/cloudflare-origin.pem` (certificate)
   - `/etc/ssl/private/cloudflare-origin.key` (private key)

## 3. Security Settings

### A. Firewall Rules

Create firewall rules to protect your platform:

1. Go to **Security** → **WAF**
2. Create these rules:

**Rule 1: Block Bad Bots**
```
Field: Known Bots
Operator: equals
Value: Bad Bots
Action: Block
```

**Rule 2: Rate Limiting for API**
```
Field: URI Path
Operator: contains
Value: /api/
Action: Rate Limit (100 requests per minute)
```

**Rule 3: Rate Limiting for Uploads**
```
Field: URI Path
Operator: contains
Value: /api/upload
Action: Rate Limit (10 requests per minute)
```

### B. Bot Fight Mode

1. Go to **Security** → **Bots**
2. Enable **Bot Fight Mode**
3. This helps protect against automated attacks

### C. DDoS Protection

Cloudflare provides automatic DDoS protection, but you can enhance it:

1. Go to **Security** → **DDoS**
2. Review and adjust sensitivity settings if needed

## 4. Performance Optimization

### A. Caching Rules

1. Go to **Rules** → **Page Rules**
2. Create these caching rules:

**Rule 1: Cache Static Assets**
```
URL: yourdomain.com/_next/static/*
Settings:
- Cache Level: Cache Everything
- Edge Cache TTL: 1 year
- Browser Cache TTL: 1 year
```

**Rule 2: API No Cache**
```
URL: yourdomain.com/api/*
Settings:
- Cache Level: Bypass
```

**Rule 3: Video Files**
```
URL: yourdomain.com/*.mp4
Settings:
- Cache Level: Cache Everything
- Edge Cache TTL: 1 month
```

### B. Compression

1. Go to **Speed** → **Optimization**
2. Enable:
   - ✅ Auto Minify (CSS, HTML, JavaScript)
   - ✅ Brotli compression

### C. Rocket Loader (Optional)

For faster JavaScript loading:
1. Enable **Rocket Loader** in Speed → Optimization
2. Note: Test thoroughly as it may affect some dynamic content

## 5. Advanced Configuration

### A. Transform Rules

Create transform rules for better SEO and security:

1. Go to **Rules** → **Transform Rules**
2. Create **Response Header Modification** rules:

**Add Security Headers:**
```
Field: Hostname
Operator: equals
Value: yourdomain.com

Headers to Add:
- X-Content-Type-Options: nosniff
- X-Frame-Options: SAMEORIGIN
- Referrer-Policy: strict-origin-when-cross-origin
```

### B. Redirect Rules

Set up redirects for better user experience:

1. Go to **Rules** → **Redirect Rules**

**HTTP to HTTPS Redirect:**
```
Field: SSL
Operator: equals
Value: Off
Redirect URL: https://$1/$2
Status Code: 301 - Permanent Redirect
```

## 6. API Token Setup

For automated certificate renewal and API access:

1. Go to **My Profile** → **API Tokens**
2. Click **Create Token**
3. Use the **Custom token** template
4. Configure:
   - **Permissions:**
     - Zone:Zone:Read
     - Zone:DNS:Edit
     - Zone:Zone Settings:Edit
   - **Zone Resources:**
     - Include: Specific zone: yourdomain.com
5. Copy the token and add it to your `.env.production` file

## 7. Monitoring and Analytics

### A. Analytics

1. Go to **Analytics & Logs** → **Web Analytics**
2. Enable Web Analytics for your domain
3. Add the analytics snippet to your frontend if desired

### B. Real User Monitoring (RUM)

1. Enable RUM in Analytics to monitor real user performance
2. This helps identify performance bottlenecks

## 8. Verification Steps

After completing the setup:

1. **DNS Propagation Check:**
   ```bash
   dig yourdomain.com
   dig www.yourdomain.com
   dig admin.yourdomain.com
   ```

2. **SSL Test:**
   - Visit https://www.ssllabs.com/ssltest/
   - Test your domain - should get A+ rating

3. **Speed Test:**
   - Visit https://gtmetrix.com/
   - Test your domain performance

4. **Security Test:**
   - Visit https://securityheaders.com/
   - Check your security headers

## 9. Maintenance

### A. Regular Tasks

- Monitor **Analytics** dashboard weekly
- Review **Security Events** for any suspicious activity
- Check **Speed** metrics monthly
- Update **Page Rules** as your application evolves

### B. Certificate Renewal

If using Let's Encrypt certificates:
- Certificates auto-renew via deployment script
- Monitor certificate expiry dates
- Test renewal process monthly

## 10. Troubleshooting

### Common Issues:

**"Too Many Redirects" Error:**
- Check SSL/TLS mode is set to **Full (strict)**
- Verify your server is properly configured for HTTPS

**504 Gateway Timeout:**
- Check your VPS is running and accessible
- Verify firewall rules allow traffic on ports 80/443
- Check if services are running: `docker-compose ps`

**Slow Performance:**
- Review caching rules
- Check if Cloudflare is caching static assets
- Monitor origin server performance

## Support Resources

- [Cloudflare Documentation](https://developers.cloudflare.com/)
- [SSL/TLS Configuration Guide](https://developers.cloudflare.com/ssl/)
- [Performance Optimization](https://developers.cloudflare.com/fundamentals/speed/)
- [Security Best Practices](https://developers.cloudflare.com/fundamentals/security/)

---

## Quick Setup Checklist

- [ ] DNS records configured
- [ ] SSL/TLS set to Full (strict)
- [ ] Security rules created
- [ ] Caching rules configured
- [ ] API token generated
- [ ] SSL test passed (A+ rating)
- [ ] Performance test completed
- [ ] All subdomains accessible 