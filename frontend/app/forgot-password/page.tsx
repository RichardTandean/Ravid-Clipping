'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '../contexts/AuthContext'
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react'

export default function ForgotPasswordPage() {
  const { resetPassword, user, loading } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setSuccess('')

    const { error: resetError } = await resetPassword(email)
    
    if (resetError) {
      setError(resetError.message)
    } else {
      setSuccess('Password reset email sent! Check your inbox and spam folder.')
    }
    
    setIsLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Back to Login */}
        <Link href="/login" className="inline-flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Login</span>
        </Link>

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center space-x-3">
            <Image 
              src="/ravid-logo.png" 
              alt="Ravid Clipper Logo" 
              width={48} 
              height={48}
              className="rounded-sm"
            />
            <h1 className="text-2xl font-bold text-gray-900">Ravid Clipper</h1>
          </Link>
        </div>

        {/* Form Container */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {!success ? (
            <>
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Reset Password</h2>
                <p className="text-gray-600">
                  Enter your email address and we'll send you a link to reset your password.
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                      placeholder="Enter your email address"
                      required
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading || !email.trim()}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                >
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>

              {/* Back to Login */}
              <div className="mt-8 text-center">
                <p className="text-gray-600">
                  Remember your password?{' '}
                  <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                    Sign In
                  </Link>
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Success State */}
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Check Your Email</h2>
                
                <div className="mb-8 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg text-sm">
                  {success}
                </div>

                <div className="space-y-4 text-gray-600">
                  <p>We've sent a password reset link to:</p>
                  <p className="font-medium text-gray-900">{email}</p>
                  <p className="text-sm">
                    Didn't receive the email? Check your spam folder or{' '}
                    <button
                      onClick={() => {
                        setSuccess('')
                        setEmail('')
                      }}
                      className="text-blue-600 hover:text-blue-700 font-medium underline"
                    >
                      try again
                    </button>
                  </p>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-200">
                  <Link 
                    href="/login" 
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    ← Back to Login
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
} 