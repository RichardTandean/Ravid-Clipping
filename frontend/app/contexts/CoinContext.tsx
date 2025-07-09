'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'

interface CoinContextType {
  coins: number
  loading: boolean
  deductCoins: (amount: number, reason: string) => Promise<{ success: boolean; error?: string }>
  addCoins: (amount: number, reason: string) => Promise<{ success: boolean; error?: string }>
  refreshBalance: () => Promise<void>
  canAfford: (amount: number) => boolean
}

const CoinContext = createContext<CoinContextType | undefined>(undefined)

export const useCoin = () => {
  const context = useContext(CoinContext)
  if (context === undefined) {
    throw new Error('useCoin must be used within a CoinProvider')
  }
  return context
}

// Coin costs configuration
export const COIN_COSTS = {
  GENERATE_CLIPS: 1000,
  CROP_VIDEO: 200,
  DOWNLOAD_CLIPS_PER_SECOND: 10,
  // Subtitle generation costs
  GENERATE_TRANSCRIPT: 1000,
  BURN_SUBTITLES: 400,
  ADD_SUBTITLES_TO_CLIPS: 50
}

export const CoinProvider = ({ children }: { children: React.ReactNode }) => {
  const [coins, setCoins] = useState(0)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  // Initialize user coin balance
  const initializeUserCoins = async (userId: string) => {
    try {
      // Check if user already has a coin balance
      const { data: existingBalance } = await supabase
        .from('user_coins')
        .select('coins')
        .eq('user_id', userId)
        .single()

      if (!existingBalance) {
        // Create initial balance (give new users 5000 coins to start)
        const { error } = await supabase
          .from('user_coins')
          .insert([{ user_id: userId, coins: 5000 }])
        
        if (!error) {
          setCoins(5000)
        }
      } else {
        setCoins(existingBalance.coins)
      }
    } catch (error) {
      console.error('Error initializing coins:', error)
    } finally {
      setLoading(false)
    }
  }

  // Refresh balance from database
  const refreshBalance = async () => {
    if (!user) return
    
    try {
      const { data, error } = await supabase
        .from('user_coins')
        .select('coins')
        .eq('user_id', user.id)
        .single()

      if (data && !error) {
        setCoins(data.coins)
      }
    } catch (error) {
      console.error('Error refreshing balance:', error)
    }
  }

  // Deduct coins from user balance
  const deductCoins = async (amount: number, reason: string) => {
    if (!user) return { success: false, error: 'User not authenticated' }
    
    if (coins < amount) {
      return { success: false, error: 'Insufficient coins' }
    }

    try {
      // Update balance in database
      const { data, error } = await supabase
        .from('user_coins')
        .update({ coins: coins - amount })
        .eq('user_id', user.id)
        .select()

      if (error) throw error

      // Log the transaction
      await supabase
        .from('coin_transactions')
        .insert([{
          user_id: user.id,
          amount: -amount,
          reason: reason,
          balance_after: coins - amount
        }])

      setCoins(coins - amount)
      return { success: true }
    } catch (error) {
      console.error('Error deducting coins:', error)
      return { success: false, error: 'Failed to deduct coins' }
    }
  }

  // Add coins to user balance
  const addCoins = async (amount: number, reason: string) => {
    if (!user) return { success: false, error: 'User not authenticated' }

    try {
      // Update balance in database
      const { data, error } = await supabase
        .from('user_coins')
        .update({ coins: coins + amount })
        .eq('user_id', user.id)
        .select()

      if (error) throw error

      // Log the transaction
      await supabase
        .from('coin_transactions')
        .insert([{
          user_id: user.id,
          amount: amount,
          reason: reason,
          balance_after: coins + amount
        }])

      setCoins(coins + amount)
      return { success: true }
    } catch (error) {
      console.error('Error adding coins:', error)
      return { success: false, error: 'Failed to add coins' }
    }
  }

  // Check if user can afford a transaction
  const canAfford = (amount: number) => {
    return coins >= amount
  }

  useEffect(() => {
    if (user) {
      initializeUserCoins(user.id)
    } else {
      setCoins(0)
      setLoading(false)
    }
  }, [user])

  const value = {
    coins,
    loading,
    deductCoins,
    addCoins,
    refreshBalance,
    canAfford,
  }

  return (
    <CoinContext.Provider value={value}>
      {children}
    </CoinContext.Provider>
  )
} 