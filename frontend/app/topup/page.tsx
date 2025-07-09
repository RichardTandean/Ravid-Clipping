'use client'

import Link from 'next/link'
import { CreditCard, Shield, Clock, ArrowLeft, Coins, Star } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useAuth } from '../contexts/AuthContext'

export default function TopUpPage() {
  const { user } = useAuth()

  const coinPackages = [
    {
      name: 'Starter',
      coins: 5000,
      price: 9.99,
      popular: false,
      bonus: 0,
      description: 'Perfect for trying out Ravid Clipper'
    },
    {
      name: 'Creator', 
      coins: 25000,
      price: 39.99,
      popular: true,
      bonus: 2500,
      description: 'Best value for regular content creators'
    },
    {
      name: 'Professional',
      coins: 100000,
      price: 149.99,
      popular: false,
      bonus: 20000,
      description: 'For serious creators and agencies'
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/pricing" className="flex items-center text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Pricing
          </Link>
        </div>
      </div>

      <section className="bg-gradient-to-br from-blue-600 to-purple-700 text-white py-16">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Top Up Your Coins
          </h1>
          <p className="text-xl opacity-90 mb-6">
            Choose a package and start creating amazing clips today
          </p>
          {user && (
            <div className="bg-white/10 backdrop-blur rounded-lg p-4 inline-block">
              <div className="flex items-center space-x-2">
                <Coins className="w-5 h-5 text-yellow-300" />
                <span>Current Balance: Loading...</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            {coinPackages.map((pkg, index) => (
              <div 
                key={index} 
                className={`bg-white rounded-2xl shadow-xl overflow-hidden ${
                  pkg.popular ? 'ring-4 ring-blue-500 relative' : ''
                }`}
              >
                {pkg.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-500 text-white px-6 py-2 rounded-full text-sm font-medium flex items-center">
                      <Star className="w-4 h-4 mr-1" />
                      Most Popular
                    </span>
                  </div>
                )}
                
                <div className="p-8">
                  <div className="text-center mb-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{pkg.name}</h3>
                    <p className="text-gray-600 mb-6">{pkg.description}</p>
                    
                    <div className="mb-4">
                      <div className="text-4xl font-bold text-blue-600 mb-1">
                        {pkg.coins.toLocaleString()}
                      </div>
                      {pkg.bonus > 0 && (
                        <div className="text-sm text-green-600 font-medium">
                          + {pkg.bonus.toLocaleString()} bonus coins
                        </div>
                      )}
                      <div className="text-gray-600">
                        Total: {(pkg.coins + pkg.bonus).toLocaleString()} coins
                      </div>
                    </div>
                    
                    <div className="text-3xl font-bold text-gray-900 mb-2">
                      ${pkg.price}
                    </div>
                  </div>

                  <Button 
                    className={`w-full ${
                      pkg.popular 
                        ? 'bg-blue-600 hover:bg-blue-700' 
                        : 'bg-gray-600 hover:bg-gray-700'
                    }`}
                    onClick={() => {
                      alert('Payment integration with Midtrans coming soon!')
                    }}
                  >
                    Buy {pkg.name} Package
                    <CreditCard className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-yellow-50 border-t border-yellow-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">
              🚧 Payment Integration Coming Soon
            </h3>
            <p className="text-yellow-700 mb-4">
              We're currently integrating Midtrans payment gateway. This feature will be available soon!
            </p>
          </div>
        </div>
      </section>
    </div>
  )
} 