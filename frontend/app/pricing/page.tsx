'use client'

import Link from 'next/link'
import { Check, Coins, Zap, Star, ArrowRight, Info, CreditCard, Users } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useAuth } from '../contexts/AuthContext'

export default function PricingPage() {
  const { user } = useAuth()

  const coinPackages = [
    {
      name: 'Starter',
      coins: 5000,
      price: 9.99,
      popular: false,
      description: 'Perfect for trying out Ravid Clipper',
      features: [
        '~5 video processing sessions',
        'Standard processing speed',
        'Basic support',
        '30-day coin validity'
      ]
    },
    {
      name: 'Creator',
      coins: 25000,
      price: 39.99,
      popular: true,
      description: 'Best value for regular content creators',
      features: [
        '~25 video processing sessions',
        'Priority processing',
        'Email support',
        '90-day coin validity',
        '10% bonus coins'
      ]
    },
    {
      name: 'Professional',
      coins: 100000,
      price: 149.99,
      popular: false,
      description: 'For serious creators and agencies',
      features: [
        '~100 video processing sessions',
        'Lightning fast processing',
        'Priority support',
        '1-year coin validity',
        '20% bonus coins',
        'Custom integrations'
      ]
    }
  ]

  const coinCosts = [
    {
      action: 'Generate Video Clips',
      cost: 1000,
      description: 'Process one video to generate multiple clips with AI analysis'
    },
    {
      action: 'YouTube Download',
      cost: '2 per second',
      description: 'Download videos from YouTube (varies by video length)'
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 to-purple-700 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              Simple, Transparent
              <span className="block text-yellow-300">Pricing</span>
            </h1>
            <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto opacity-90">
              Pay only for what you use with our flexible coin system. No subscriptions, no commitments.
            </p>
            <div className="flex items-center justify-center space-x-2 text-lg">
              <Coins className="w-6 h-6 text-yellow-300" />
              <span>1 Coin = $0.002 USD</span>
            </div>
          </div>
        </div>
      </section>

      {/* How Coins Work */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              How Our Coin System Works
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Simple, transparent pricing that scales with your usage. Buy coins once, use them anytime.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="text-center p-8 bg-blue-50 rounded-2xl">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CreditCard className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">1. Buy Coins</h3>
              <p className="text-gray-600">
                Purchase coin packages based on your needs. Larger packages offer better value with bonus coins.
              </p>
            </div>

            <div className="text-center p-8 bg-purple-50 rounded-2xl">
              <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">2. Use Features</h3>
              <p className="text-gray-600">
                Coins are automatically deducted when you use our features. Different actions cost different amounts.
              </p>
            </div>

            <div className="text-center p-8 bg-green-50 rounded-2xl">
              <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Users className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">3. No Waste</h3>
              <p className="text-gray-600">
                Coins don't expire for a long time, and you only pay for what you actually use. No monthly fees.
              </p>
            </div>
          </div>

          {/* Coin Costs Table */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 flex items-center">
                <Coins className="w-6 h-6 text-blue-600 mr-2" />
                Coin Costs per Action
              </h3>
            </div>
            <div className="divide-y divide-gray-200">
              {coinCosts.map((item, index) => (
                <div key={index} className="px-6 py-6 flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900">{item.action}</h4>
                    <p className="text-gray-600 mt-1">{item.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      {typeof item.cost === 'number' 
                        ? `${item.cost.toLocaleString()} coins` 
                        : `${item.cost}`
                      }
                    </div>
                    {typeof item.cost === 'number' && (
                      <div className="text-sm text-gray-500">
                        ~${(item.cost * 0.002).toFixed(2)} USD
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Plans */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Choose Your Coin Package
            </h2>
            <p className="text-xl text-gray-600">
              Start small or go big - pick the package that fits your content creation needs
            </p>
          </div>

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
                      <div className="text-gray-600">coins</div>
                    </div>
                    
                    <div className="text-3xl font-bold text-gray-900 mb-2">
                      ${pkg.price}
                    </div>
                    <div className="text-gray-600">
                      ${(pkg.price / pkg.coins * 1000).toFixed(3)} per 1,000 coins
                    </div>
                  </div>

                  <ul className="space-y-4 mb-8">
                    {pkg.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start space-x-3">
                        <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href="/topup">
                    <Button 
                      className={`w-full ${
                        pkg.popular 
                          ? 'bg-blue-600 hover:bg-blue-700' 
                          : 'bg-gray-600 hover:bg-gray-700'
                      }`}
                    >
                      Buy {pkg.name} Package
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Free Trial */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-8 border border-green-200">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              🎉 Start with 5,000 Free Coins!
            </h2>
            <p className="text-lg text-gray-600 mb-6">
              New users get 5,000 coins absolutely free - enough to process 5 videos and see the magic happen.
            </p>
            <Link href={user ? "/dashboard" : "/register"}>
              <Button size="lg" className="bg-green-600 hover:bg-green-700">
                Claim Your Free Coins
                <Coins className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-8">
            <div className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <Info className="w-5 h-5 text-blue-600 mr-2" />
                Do coins expire?
              </h3>
              <p className="text-gray-600">
                Coins have different expiry periods based on your package: Starter (30 days), Creator (90 days), 
                Professional (1 year). We'll always notify you before coins expire.
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <Info className="w-5 h-5 text-blue-600 mr-2" />
                Can I get a refund?
              </h3>
              <p className="text-gray-600">
                We offer a 30-day money-back guarantee for unused coins. If you're not satisfied with Ravid Clipper, 
                we'll refund your purchase for any unused coins within 30 days.
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <Info className="w-5 h-5 text-blue-600 mr-2" />
                What payment methods do you accept?
              </h3>
              <p className="text-gray-600">
                We accept all major credit cards, debit cards, and digital wallets through our secure payment 
                processor Midtrans. All transactions are encrypted and secure.
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <Info className="w-5 h-5 text-blue-600 mr-2" />
                How long does video processing take?
              </h3>
              <p className="text-gray-600">
                Processing time depends on video length and package tier. Creator and Professional packages get 
                priority processing. Typical processing time is 2-5 minutes for a 30-minute video.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of creators who trust Ravid Clipper for their video content needs
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href={user ? "/dashboard" : "/register"}>
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
                Start Free Trial
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/features">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600">
                View Features
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
} 