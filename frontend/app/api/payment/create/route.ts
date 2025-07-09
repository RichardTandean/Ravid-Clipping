import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Midtrans configuration
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY!
const MIDTRANS_CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY!
const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === 'true'

const MIDTRANS_BASE_URL = IS_PRODUCTION 
  ? 'https://api.midtrans.com/v2'
  : 'https://api.sandbox.midtrans.com/v2'

export async function POST(request: NextRequest) {
  try {
    const { packageId, userToken } = await request.json()

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser(userToken)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get coin package details
    const { data: coinPackage, error: packageError } = await supabase
      .from('coin_packages')
      .select('*')
      .eq('id', packageId)
      .eq('is_active', true)
      .single()

    if (packageError || !coinPackage) {
      return NextResponse.json({ error: 'Invalid package' }, { status: 400 })
    }

    // Calculate total coins with bonus
    const bonusCoins = Math.floor(coinPackage.coins * (coinPackage.bonus_percentage / 100))
    const totalCoins = coinPackage.coins + bonusCoins

    // Generate unique transaction ID
    const transactionId = `VCP-${Date.now()}-${user.id.slice(-6)}`

    // Prepare Midtrans transaction data
    const transactionData = {
      transaction_details: {
        order_id: transactionId,
        gross_amount: coinPackage.price_idr
      },
      customer_details: {
        email: user.email,
        first_name: user.email?.split('@')[0] || 'User'
      },
      item_details: [
        {
          id: coinPackage.id,
          price: coinPackage.price_idr,
          quantity: 1,
          name: `${coinPackage.name} - ${totalCoins.toLocaleString()} Coins`,
          category: 'Digital Coins'
        }
      ],
      custom_field1: user.id, // Store user ID for webhook processing
      custom_field2: totalCoins.toString(), // Store coins to credit
      callbacks: {
        finish: `${process.env.NEXT_PUBLIC_APP_URL}/payment/success`,
        error: `${process.env.NEXT_PUBLIC_APP_URL}/payment/error`,
        pending: `${process.env.NEXT_PUBLIC_APP_URL}/payment/pending`
      }
    }

    // Create Midtrans transaction
    const midtransResponse = await fetch(`${MIDTRANS_BASE_URL}/charge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(MIDTRANS_SERVER_KEY + ':').toString('base64')}`
      },
      body: JSON.stringify(transactionData)
    })

    const midtransResult = await midtransResponse.json()

    if (!midtransResponse.ok) {
      console.error('Midtrans error:', midtransResult)
      return NextResponse.json({ error: 'Payment gateway error' }, { status: 500 })
    }

    // Store payment transaction in database
    const { error: dbError } = await supabase
      .from('payment_transactions')
      .insert([{
        user_id: user.id,
        transaction_id: transactionId,
        payment_method: 'midtrans',
        amount_idr: coinPackage.price_idr,
        coins_purchased: totalCoins,
        status: 'pending',
        gateway_response: midtransResult
      }])

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json({ error: 'Failed to save transaction' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      transaction_id: transactionId,
      payment_url: midtransResult.redirect_url,
      token: midtransResult.token
    })

  } catch (error) {
    console.error('Payment creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 