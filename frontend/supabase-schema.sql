-- Video Clipper Database Schema for Supabase
-- Run this SQL in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User Coins Table
-- Stores each user's coin balance
CREATE TABLE user_coins (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  coins INTEGER DEFAULT 0 NOT NULL CHECK (coins >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Coin Transactions Table
-- Logs all coin transactions for audit trail
CREATE TABLE coin_transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL, -- Positive for credits, negative for debits
  reason TEXT NOT NULL,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment Transactions Table
-- Stores payment gateway transactions
CREATE TABLE payment_transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  transaction_id TEXT NOT NULL, -- Payment gateway transaction ID
  payment_method TEXT NOT NULL, -- 'midtrans', 'xendit', etc.
  amount_idr INTEGER NOT NULL,
  coins_purchased INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
  gateway_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Video Processing History
-- Track user's video processing history
CREATE TABLE video_processing_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  filename TEXT NOT NULL,
  file_size BIGINT,
  processing_type TEXT NOT NULL, -- 'upload', 'youtube_download', 'youtube_process'
  coins_spent INTEGER NOT NULL,
  ai_analysis_used BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for better performance
CREATE INDEX idx_user_coins_user_id ON user_coins(user_id);
CREATE INDEX idx_coin_transactions_user_id ON coin_transactions(user_id);
CREATE INDEX idx_coin_transactions_created_at ON coin_transactions(created_at);
CREATE INDEX idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX idx_video_processing_history_user_id ON video_processing_history(user_id);

-- Row Level Security (RLS) Policies
ALTER TABLE user_coins ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_processing_history ENABLE ROW LEVEL SECURITY;

-- User Coins Policies
CREATE POLICY "Users can view their own coin balance" ON user_coins
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own coin balance" ON user_coins
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own coin record" ON user_coins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Coin Transactions Policies
CREATE POLICY "Users can view their own transactions" ON coin_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions" ON coin_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Payment Transactions Policies
CREATE POLICY "Users can view their own payment transactions" ON payment_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payment transactions" ON payment_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Video Processing History Policies
CREATE POLICY "Users can view their own processing history" ON video_processing_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own processing history" ON video_processing_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Functions
-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
CREATE TRIGGER update_user_coins_updated_at BEFORE UPDATE ON user_coins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to initialize user coins when a user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_coins (user_id, coins)
  VALUES (NEW.id, 5000); -- Give new users 5000 coins to start
  
  INSERT INTO coin_transactions (user_id, amount, reason, balance_after)
  VALUES (NEW.id, 5000, 'Welcome bonus for new user', 5000);
  
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically create coin balance for new users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Insert some sample coin packages for reference
CREATE TABLE coin_packages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  coins INTEGER NOT NULL,
  price_idr INTEGER NOT NULL,
  bonus_percentage INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO coin_packages (name, coins, price_idr, bonus_percentage) VALUES
  ('Starter Pack', 5000, 50000, 0),
  ('Popular Pack', 10000, 100000, 20), -- 12000 coins total
  ('Premium Pack', 20000, 250000, 50); -- 30000 coins total 