import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY!

// Verify Midtrans signature
function verifySignature(orderId: string, statusCode: string, grossAmount: string, serverKey: string): string {
  const signatureKey = crypto
    .createHash('sha512')
    .update(orderId + statusCode + grossAmount + serverKey)
    .digest('hex')
  return signatureKey
}

export async function POST(request: NextRequest) {
  try {
    const notification = await request.json()
    
    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
      custom_field1: userId,
      custom_field2: coinsToCredit
    } = notification

    // Verify signature
    const expectedSignature = verifySignature(order_id, status_code, gross_amount, MIDTRANS_SERVER_KEY)
    
    if (signature_key !== expectedSignature) {
      console.error('Invalid signature:', { received: signature_key, expected: expectedSignature })
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    // Get existing payment transaction
    const { data: paymentTransaction, error: fetchError } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('transaction_id', order_id)
      .single()

    if (fetchError || !paymentTransaction) {
      console.error('Transaction not found:', order_id)
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Determine final status
    let finalStatus = 'pending'
    let shouldCreditCoins = false

    if (transaction_status === 'capture' || transaction_status === 'settlement') {
      if (fraud_status === 'accept' || !fraud_status) {
        finalStatus = 'success'
        shouldCreditCoins = true
      }
    } else if (transaction_status === 'cancel' || transaction_status === 'expire') {
      finalStatus = 'cancelled'
    } else if (transaction_status === 'deny') {
      finalStatus = 'failed'
    }

    // Update payment transaction status
    const { error: updateError } = await supabase
      .from('payment_transactions')
      .update({
        status: finalStatus,
        gateway_response: notification,
        updated_at: new Date().toISOString()
      })
      .eq('transaction_id', order_id)

    if (updateError) {
      console.error('Failed to update payment transaction:', updateError)
      return NextResponse.json({ error: 'Database update failed' }, { status: 500 })
    }

    // Credit coins if payment successful
    if (shouldCreditCoins && paymentTransaction.status !== 'success') {
      const coinsAmount = parseInt(coinsToCredit || paymentTransaction.coins_purchased.toString())
      
      try {
        // Get current user balance
        const { data: userCoins, error: balanceError } = await supabase
          .from('user_coins')
          .select('coins')
          .eq('user_id', userId || paymentTransaction.user_id)
          .single()

        if (balanceError) {
          console.error('Failed to get user balance:', balanceError)
          return NextResponse.json({ error: 'Failed to get user balance' }, { status: 500 })
        }

        const newBalance = userCoins.coins + coinsAmount

        // Update user coin balance
        const { error: coinUpdateError } = await supabase
          .from('user_coins')
          .update({ coins: newBalance })
          .eq('user_id', userId || paymentTransaction.user_id)

        if (coinUpdateError) {
          console.error('Failed to update coin balance:', coinUpdateError)
          return NextResponse.json({ error: 'Failed to update coins' }, { status: 500 })
        }

        // Log the transaction
        const { error: transactionLogError } = await supabase
          .from('coin_transactions')
          .insert([{
            user_id: userId || paymentTransaction.user_id,
            amount: coinsAmount,
            reason: `Payment successful - ${paymentTransaction.transaction_id}`,
            balance_after: newBalance
          }])

        if (transactionLogError) {
          console.error('Failed to log coin transaction:', transactionLogError)
          // Don't return error here as coins were already credited
        }

        console.log(`Successfully credited ${coinsAmount} coins to user ${userId || paymentTransaction.user_id}`)
        
      } catch (coinError) {
        console.error('Error crediting coins:', coinError)
        // Mark payment as success but log the coin crediting issue
        await supabase
          .from('payment_transactions')
          .update({
            status: 'success_pending_credit',
            gateway_response: { ...notification, coin_credit_error: coinError }
          })
          .eq('transaction_id', order_id)
      }
    }

    return NextResponse.json({ success: true, status: finalStatus })

  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Handle GET requests (for webhook verification)
export async function GET(request: NextRequest) {
  return NextResponse.json({ message: 'Webhook endpoint is active' })
} 