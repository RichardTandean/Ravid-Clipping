-- Quick Coin System Setup for Supabase
-- Run this in your Supabase SQL Editor to fix the coin system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User Coins Table
CREATE TABLE IF NOT EXISTS user_coins (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  coins INTEGER DEFAULT 0 NOT NULL CHECK (coins >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Coin Transactions Table
CREATE TABLE IF NOT EXISTS coin_transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_coins ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for user_coins
DROP POLICY IF EXISTS "Users can view their own coin balance" ON user_coins;
CREATE POLICY "Users can view their own coin balance" ON user_coins
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own coin balance" ON user_coins;
CREATE POLICY "Users can update their own coin balance" ON user_coins
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own coin record" ON user_coins;
CREATE POLICY "Users can insert their own coin record" ON user_coins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for coin_transactions
DROP POLICY IF EXISTS "Users can view their own transactions" ON coin_transactions;
CREATE POLICY "Users can view their own transactions" ON coin_transactions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own transactions" ON coin_transactions;
CREATE POLICY "Users can insert their own transactions" ON coin_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_coins_user_id ON user_coins(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_id ON coin_transactions(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for updating updated_at
DROP TRIGGER IF EXISTS update_user_coins_updated_at ON user_coins;
CREATE TRIGGER update_user_coins_updated_at BEFORE UPDATE ON user_coins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to initialize user coins
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_coins (user_id, coins)
  VALUES (NEW.id, 5000)
  ON CONFLICT (user_id) DO NOTHING;
  
  INSERT INTO coin_transactions (user_id, amount, reason, balance_after)
  VALUES (NEW.id, 5000, 'Welcome bonus for new user', 5000);
  
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for new users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user(); 