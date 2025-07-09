'use client'

import React, { useState } from 'react'
import { useCoin } from '../contexts/CoinContext'
import { useAuth } from '../contexts/AuthContext'
import { Coins, Plus, TestTube } from 'lucide-react'

export const CoinDisplay: React.FC = () => {
  const { coins, loading, addCoins } = useCoin()
  const { user } = useAuth()
  const [showTopUp, setShowTopUp] = useState(false)
  const [addingTestCoins, setAddingTestCoins] = useState(false)

  // Check if we're in development mode
  const isDevelopment = process.env.NODE_ENV === 'development'

  if (!user) return null

  const handleAddTestCoins = async () => {
    setAddingTestCoins(true)
    try {
      const result = await addCoins(100000, 'Test coins - Development mode')
      if (result.success) {
        alert('✅ Successfully added 100,000 test coins!')
      } else {
        alert('❌ Failed to add test coins: ' + result.error)
      }
    } catch (error) {
      alert('❌ Error adding test coins: ' + error)
    } finally {
      setAddingTestCoins(false)
    }
  }

  return (
    <div className="flex items-center space-x-1 sm:space-x-2">
      <div className="flex items-center space-x-1 sm:space-x-2 bg-gradient-to-r from-yellow-400 to-yellow-600 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-full">
        <Coins size={16} className="sm:w-5 sm:h-5" />
        <span className="font-semibold text-sm sm:text-base">
          {loading ? '...' : coins.toLocaleString()}
        </span>
      </div>
      
      {/* Test button - only visible in development and on desktop */}
      {isDevelopment && (
        <button
          onClick={handleAddTestCoins}
          disabled={addingTestCoins}
          className="hidden lg:flex items-center space-x-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-3 py-2 rounded-full transition-colors"
          title="Add 100,000 test coins (Development only)"
        >
          <TestTube size={16} />
          <span className="text-sm font-medium">
            {addingTestCoins ? 'Adding...' : '+100K Test'}
          </span>
        </button>
      )}
      
      <button
        onClick={() => setShowTopUp(true)}
        className="flex items-center space-x-1 bg-green-600 hover:bg-green-700 text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded-full transition-colors"
      >
        <Plus size={14} className="sm:w-4 sm:h-4" />
        <span className="text-xs sm:text-sm font-medium">
          <span className="hidden sm:inline">Top Up</span>
          <span className="sm:hidden">+</span>
        </span>
      </button>

      {showTopUp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Top Up Coins</h3>
            <div className="space-y-3">
              <div className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer">
                <div className="flex justify-between items-center">
                  <span>5,000 Coins</span>
                  <span className="font-semibold">Rp 50,000</span>
                </div>
              </div>
              <div className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer">
                <div className="flex justify-between items-center">
                  <span>12,000 Coins</span>
                  <span className="font-semibold">Rp 100,000</span>
                </div>
                <div className="text-sm text-green-600">+20% Bonus!</div>
              </div>
              <div className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer">
                <div className="flex justify-between items-center">
                  <span>30,000 Coins</span>
                  <span className="font-semibold">Rp 250,000</span>
                </div>
                <div className="text-sm text-green-600">+50% Bonus!</div>
              </div>
            </div>
            <div className="mt-4 text-xs text-gray-500">
              Payment via Midtrans (BCA, Mandiri, OVO, GoPay, etc.)
            </div>
            <div className="mt-4 flex space-x-2">
              <button
                onClick={() => setShowTopUp(false)}
                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700">
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 