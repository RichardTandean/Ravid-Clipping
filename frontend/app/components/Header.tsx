'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '../contexts/AuthContext'
import { CoinDisplay } from './CoinDisplay'
import { LoginModal } from './auth/LoginModal'
import { RegisterModal } from './auth/RegisterModal'
import { User, LogOut } from 'lucide-react'

export const Header: React.FC = () => {
  const { user, signOut, loading } = useAuth()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    setShowUserMenu(false)
  }

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
        <div className="flex justify-between items-center h-16 min-w-0">
          {/* Logo */}
          <div className="flex items-center min-w-0 flex-shrink-0">
            <Link href="/">
              <div className="flex items-center space-x-2 sm:space-x-3 hover:opacity-80 transition-opacity">
                <Image 
                  src="/ravid-logo.png" 
                  alt="Ravid Clipper Logo" 
                  width={32} 
                  height={32}
                  className="rounded-sm flex-shrink-0"
                />
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                  <span className="hidden sm:inline">Ravid Clipper</span>
                  <span className="sm:hidden">Ravid</span>
                </h1>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link href="/features" className="text-gray-700 hover:text-blue-600 font-medium">
              Features
            </Link>
            <Link href="/pricing" className="text-gray-700 hover:text-blue-600 font-medium">
              Pricing
            </Link>
            {user && (
              <>
                <Link href="/dashboard" className="text-gray-700 hover:text-blue-600 font-medium">
                  Dashboard
                </Link>
                <Link href="/crop" className="text-gray-700 hover:text-blue-600 font-medium">
                  Crop Video
                </Link>
                <Link href="/subtitles" className="text-gray-700 hover:text-purple-600 font-medium">
                  Subtitles
                </Link>
              </>
            )}

          </nav>

          {/* User Section */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {loading ? (
              <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
                <div className="hidden sm:block w-16 h-4 bg-gray-200 rounded animate-pulse"></div>
              </div>
            ) : user ? (
              <>
                <CoinDisplay />
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 focus:outline-none"
                  >
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <User size={20} className="text-white" />
                    </div>
                    <span className="hidden sm:block font-medium text-gray-900 max-w-24 md:max-w-32 lg:max-w-none truncate">
                      {user.user_metadata?.first_name || user.email?.split('@')[0] || 'User'}
                    </span>
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50">
                      <div className="px-4 py-2 text-sm text-gray-700 border-b">
                        <div className="truncate" title={user.email || ''}>
                        {user.email}
                        </div>
                      </div>
                      <button
                        onClick={handleSignOut}
                        className="flex items-center space-x-2 w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <LogOut size={16} />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="text-gray-700 hover:text-gray-900 font-medium px-3 py-2 rounded-md hover:bg-gray-100 transition-colors text-sm sm:text-base"
                >
                  Sign In
                </button>
                <button
                  onClick={() => setShowRegisterModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-medium transition-colors text-sm sm:text-base"
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSwitchToRegister={() => {
          setShowLoginModal(false)
          setShowRegisterModal(true)
        }}
      />
      
      <RegisterModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        onSwitchToLogin={() => {
          setShowRegisterModal(false)
          setShowLoginModal(true)
        }}
      />

      {/* Click outside to close user menu */}
      {showUserMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </header>
  )
} 