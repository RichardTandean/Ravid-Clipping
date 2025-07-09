'use client'

import Link from 'next/link'
import { Play, Scissors, Sparkles, Zap, Download, Upload, Settings, Wand2, Type, Edit3, ArrowRight, CheckCircle, Clock, Target } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useAuth } from '../contexts/AuthContext'

export default function FeaturesPage() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 to-purple-700 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Powerful Features for
              <span className="block text-yellow-300">Content Creators</span>
            </h1>
            <p className="text-lg md:text-2xl mb-8 max-w-3xl mx-auto opacity-90">
              Everything you need to transform your long-form content into viral, engaging clips with Ravid Clipper
            </p>
            <Link href={user ? "/dashboard" : "/register"}>
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
                Start Creating Now
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Current Features */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Available Now
            </h2>
            <p className="text-lg md:text-xl text-gray-600">
              Production-ready features you can use today
            </p>
          </div>

          {/* AI Video Clipping */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-16">
            <div className="grid lg:grid-cols-2 gap-0">
              <div className="p-12">
                <div className="flex items-center mb-6">
                  <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mr-4">
                    <Scissors className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <span className="inline-block bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full mb-2">
                      ✅ Available Now
                    </span>
                    <h3 className="text-3xl font-bold text-gray-900">AI Video Clipping</h3>
                  </div>
                </div>
                
                <p className="text-lg text-gray-600 mb-8">
                  Ravid Clipper's advanced AI analyzes your video content to automatically identify the most engaging moments 
                  and create perfectly timed clips optimized for social media platforms.
                </p>

                <div className="space-y-4 mb-8">
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="w-6 h-6 text-green-500 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-gray-900">Semantic Analysis</h4>
                      <p className="text-gray-600">AI understands content context and meaning for better clip selection</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="w-6 h-6 text-green-500 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-gray-900">Smart Segmentation</h4>
                      <p className="text-gray-600">Automatically detects topic changes and speaker transitions</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="w-6 h-6 text-green-500 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-gray-900">Multiple Formats</h4>
                      <p className="text-gray-600">Supports YouTube URLs and direct file uploads</p>
                    </div>
                  </div>
                </div>

                <Link href="/dashboard">
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    Try It Now
                    <Play className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
              
              <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-12 flex items-center justify-center">
                <div className="relative">
                  <div className="w-80 h-48 bg-gradient-to-r from-blue-900 to-purple-900 rounded-lg shadow-2xl flex items-center justify-center">
                    <Play className="w-16 h-16 text-white opacity-80" />
                  </div>
                  <div className="absolute -bottom-4 -right-4 w-24 h-16 bg-white rounded-lg shadow-lg flex items-center justify-center">
                    <Scissors className="w-8 h-8 text-blue-600" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming Features */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Coming Soon
            </h2>
            <p className="text-lg md:text-xl text-gray-600">
              Exciting features we're building for you
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Animated Captions */}
            <div className="bg-gray-50 rounded-2xl p-8 border-2 border-dashed border-gray-300">
              <div className="flex items-center mb-6">
                <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mr-4">
                  <Type className="w-8 h-8 text-white" />
                </div>
                <div>
                  <span className="inline-block bg-yellow-100 text-yellow-800 text-sm font-medium px-3 py-1 rounded-full mb-2">
                    🚧 Coming Soon
                  </span>
                  <h3 className="text-xl md:text-2xl font-bold text-gray-900">Animated Captions</h3>
                </div>
              </div>
              
              <p className="text-base md:text-lg text-gray-600 mb-6">
                Automatically generate engaging animated captions and subtitles with customizable styles, 
                fonts, and animations to boost viewer engagement.
              </p>

              <div className="space-y-3 mb-6">
                <div className="flex items-center space-x-3">
                  <Clock className="w-5 h-5 text-purple-500" />
                  <span className="text-sm md:text-base text-gray-700">Auto-synced timing with speech</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Wand2 className="w-5 h-5 text-purple-500" />
                  <span className="text-sm md:text-base text-gray-700">Multiple animation styles</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Settings className="w-5 h-5 text-purple-500" />
                  <span className="text-sm md:text-base text-gray-700">Customizable fonts and colors</span>
                </div>
              </div>

              <div className="bg-purple-100 border border-purple-200 rounded-lg p-4">
                <p className="text-purple-800 text-sm">
                  <strong>Expected:</strong> Q2 2024 • This feature will help increase video accessibility and engagement
                </p>
              </div>
            </div>

            {/* Basic Editing Tools */}
            <div className="bg-gray-50 rounded-2xl p-8 border-2 border-dashed border-gray-300">
              <div className="flex items-center mb-6">
                <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mr-4">
                  <Edit3 className="w-8 h-8 text-white" />
                </div>
                <div>
                  <span className="inline-block bg-yellow-100 text-yellow-800 text-sm font-medium px-3 py-1 rounded-full mb-2">
                    🚧 Coming Soon
                  </span>
                  <h3 className="text-2xl font-bold text-gray-900">Basic Editing Tools</h3>
                </div>
              </div>
              
              <p className="text-lg text-gray-600 mb-6">
                Simple yet powerful editing tools to fine-tune your clips with trimming, 
                basic filters, and batch processing capabilities.
              </p>

              <div className="space-y-3 mb-6">
                <div className="flex items-center space-x-3">
                  <Scissors className="w-5 h-5 text-green-500" />
                  <span className="text-gray-700">Precise trim and cut tools</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Sparkles className="w-5 h-5 text-green-500" />
                  <span className="text-gray-700">Filters and effects library</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Zap className="w-5 h-5 text-green-500" />
                  <span className="text-gray-700">Batch processing for multiple clips</span>
                </div>
              </div>

              <div className="bg-green-100 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm">
                  <strong>Expected:</strong> Q3 2024 • Perfect for creators who need quick editing capabilities
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Feature Comparison
            </h2>
            <p className="text-lg md:text-xl text-gray-600">
              See what's available and what's coming
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-900">Feature</th>
                    <th className="px-6 py-4 text-center text-sm font-medium text-gray-900">Status</th>
                    <th className="px-6 py-4 text-center text-sm font-medium text-gray-900">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">AI Video Clipping</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        ✅ Available
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">Automatically generate clips from long videos</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">YouTube Integration</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        ✅ Available
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">Process videos directly from YouTube URLs</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Semantic Analysis</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        ✅ Available
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">AI understands content context for better clips</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Animated Captions</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        🚧 Q2 2024
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">Auto-generated animated subtitles and captions</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Basic Editing</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        🚧 Q3 2024
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">Trim, cut, and apply basic filters to clips</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Batch Processing</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        🚧 Q3 2024
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">Process multiple videos simultaneously</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Try Our Features?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
                          Start with Ravid Clipper's AI video clipping feature and transform your content today
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href={user ? "/dashboard" : "/register"}>
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600">
                View Pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
} 