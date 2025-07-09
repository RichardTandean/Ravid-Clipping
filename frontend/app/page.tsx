'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Play, Scissors, Upload, Download, Zap, Users, Star, ArrowRight } from 'lucide-react'
import { Button } from './components/ui/Button'
import { useAuth } from './contexts/AuthContext'

export default function LandingPage() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 md:pt-16 pb-10 md:pb-24">
          <div className="text-center">
            <h1 className="text-xl md:text-7xl font-bold text-gray-900 mb-0 md:mb-6">
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                #1 AI VIDEO CLIPPING TOOL
              </span>
            </h1>
            <h2 className="text-lg md:text-5xl font-bold text-gray-900 mb-2 md:mb-8">
              1 long video, 10 viral clips.{' '}
              <span className="text-blue-600">Create 10x faster.</span>
            </h2>
            <p className="text-sm md:text-2xl text-gray-600 mb-12 max-w-4xl mx-auto">
              Ravid Clipper turns long videos into shorts, and publishes them to all social platforms in one click.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-2 md:gap-4 justify-center items-center mb-8 md:mb-16">
              <div className="flex items-center bg-gray-800 text-white px-3 md:px-6 py-3 rounded-full space-x-2 md:space-x-3">
                <Play className="w-4 md:w-5 h-4 md:h-5" />
                <input
                  type="text"
                  placeholder="Drop a video link"
                  className="text-sm md:text-base bg-transparent border-none outline-none text-white placeholder-gray-300 w-40 md:w-64"
                />
              </div>
              
              <span className="text-gray-500 font-medium text-sm md:text-base">or</span>
              
              <Link href={user ? "/dashboard" : "/register"}>
                <Button size="lg" className="text-sm md:text-base bg-white text-gray-900 hover:bg-gray-100 border-2 border-gray-200">
                  Get free clips
                </Button>
              </Link>
              
              <Link href="/dashboard">
                <Button size="lg" variant="outline" className="text-sm md:text-base">
                  Upload files
                </Button>
              </Link>
            </div>

            {/* Demo Video Placeholder */}
            <div className="relative max-w-4xl mx-auto">
              <div className="relative bg-gradient-to-r from-blue-900 to-purple-900 rounded-2xl overflow-hidden shadow-2xl">
                <div className="aspect-video flex items-center justify-center">
                  <div className="text-center text-white">
                    <Play className="w-16 h-16 mx-auto mb-4 opacity-80" />
                    <p className="text-lg opacity-90">Watch Demo Video</p>
                    <p className="text-sm opacity-70">See how it works in 60 seconds</p>
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-10 md:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-xl md:text-4xl font-bold text-gray-900 mb-4">
              Why Choose Ravid Clipper?
            </h2>
            <p className="text-sm md:text-xl text-gray-600 max-w-3xl mx-auto">
              Transform your long-form content into engaging clips that capture attention and drive engagement across all platforms.
        </p>
      </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100">
              <div className="w-10 h-10 md:w-16 md:h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6">
                <Play className="w-4 md:w-8 h-4 md:h-8 text-white" />
              </div>
              <h3 className="text-lg md:text-2xl font-bold text-gray-900 mb-2 md:mb-4">Smart Analysis</h3>
              <p className="text-sm md:text-base text-gray-600 leading-relaxed">
                Ravid Clipper analyzes your video content to identify the most engaging moments, 
                creating clips that maximize viewer retention and social media performance.
              </p>
            </div>
            <div className="text-center p-8 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100">
              <div className="w-10 h-10 md:w-16 md:h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Zap className="w-4 md:w-8 h-4 md:h-8 text-white" />
              </div>
              <h3 className="text-lg md:text-2xl font-bold text-gray-900 mb-2 md:mb-4">Lightning Fast</h3>
              <p className="text-sm md:text-base text-gray-600 leading-relaxed">
                Generate multiple high-quality clips in minutes, not hours.                 Ravid Clipper's optimized processing 
                pipeline delivers results 10x faster than manual editing.
              </p>
            </div>
            <div className="text-center p-8 rounded-2xl bg-gradient-to-br from-green-50 to-green-100">
              <div className="w-10 h-10 md:w-16 md:h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Scissors className="w-4 md:w-8 h-4 md:h-8 text-white" />
              </div>
              <h3 className="text-lg md:text-2xl font-bold text-gray-900 mb-2 md:mb-4">Smart Editing</h3>
              <p className="text-sm md:text-base text-gray-600 leading-relaxed">
                Automatically optimized for social platforms with perfect timing, aspect ratios, 
                and content structure that drives engagement and shares.
              </p>
                        </div>
                            </div>
                        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-12 md:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-xl md:text-4xl font-bold text-gray-900 mb-2 md:mb-4">
              How It Works
            </h2>
            <p className="text-sm md:text-xl text-gray-600">
              Transform your videos in just 3 simple steps
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="relative">
                <div className="w-12 h-12 md:w-20 md:h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6">
                  <Upload className="w-6 md:w-10 h-6 md:h-10 text-white" />
                          </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 md:w-8 md:h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-xs md:text-base text-blue-600 font-bold">1</span>
                          </div>
                        </div>
              <h3 className="text-md md:text-2xl font-bold text-gray-900 mb-2 md:mb-4">Upload Your Video</h3>
              <p className="text-sm md:text-base text-gray-600">
                Upload your long-form video or paste a YouTube URL. We support all major video formats 
                and handle the processing automatically.
              </p>
            </div>

            <div className="text-center">
              <div className="relative">
                <div className="w-12 h-12 md:w-20 md:h-20 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6">
                  <Play className="w-6 md:w-10 h-6 md:h-10 text-white" />
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 md:w-8 md:h-8 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-xs md:text-base text-purple-600 font-bold">2</span>
                          </div>
                        </div>
              <h3 className="text-lg md:text-2xl font-bold text-gray-900 mb-2 md:mb-4">Smart Analysis</h3>
                      <p className="text-sm md:text-base text-gray-600">
                Our system analyzes your video for engaging moments, speaker changes, topic shifts, 
                and viral potential to create the perfect clips.
                      </p>
                    </div>

            <div className="text-center">
              <div className="relative">
                <div className="w-12 h-12 md:w-20 md:h-20 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6">
                  <Download className="w-6 md:w-10 h-6 md:h-10 text-white" />
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 md:w-8 md:h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-xs md:text-base text-green-600 font-bold">3</span>
                </div>
              </div>
              <h3 className="text-lg md:text-2xl font-bold text-gray-900 mb-2 md:mb-4">Download & Share</h3>
              <p className="text-sm md:text-base text-gray-600">
                Get your professionally crafted clips ready for social media. Each clip is optimized 
                for maximum engagement and easy sharing.
              </p>
            </div>
                  </div>
                    </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-blue-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 text-center text-white">
                      <div>
              <div className="text-4xl font-bold mb-2">1M+</div>
              <div className="text-blue-100">Videos Processed</div>
                      </div>
                      <div>
              <div className="text-4xl font-bold mb-2">10M+</div>
              <div className="text-blue-100">Clips Generated</div>
                      </div>
                      <div>
              <div className="text-4xl font-bold mb-2">50K+</div>
              <div className="text-blue-100">Happy Creators</div>
                      </div>
                      <div>
              <div className="text-4xl font-bold mb-2">99.9%</div>
              <div className="text-blue-100">Uptime</div>
                      </div>
                    </div>
                  </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-purple-600 to-blue-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Create Viral Clips?
          </h2>
          <p className="text-xl text-purple-100 mb-8">
            Join thousands of creators who are already using Ravid Clipper to grow their audience.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href={user ? "/dashboard" : "/register"}>
              <Button size="lg" className="bg-white text-purple-600 hover:bg-gray-100">
                Start Creating Now
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/features">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-purple-600">
                Learn More
              </Button>
            </Link>
                  </div>
                </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <Image 
                  src="/ravid-logo.png" 
                  alt="Ravid Clipper Logo" 
                  width={32} 
                  height={32}
                  className="rounded-sm"
                />
                <span className="text-xl font-bold">Ravid Clipper</span>
              </div>
                              <p className="text-gray-400">
                  Transform your long videos into viral clips with Ravid Clipper's intelligent precision.
                </p>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/features" className="hover:text-white">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-white">Pricing</Link></li>
                <li><Link href="/dashboard" className="hover:text-white">Dashboard</Link></li>
              </ul>
          </div>
            
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">About</a></li>
                <li><a href="#" className="hover:text-white">Blog</a></li>
                <li><a href="#" className="hover:text-white">Careers</a></li>
              </ul>
      </div>

            <div>
              <h3 className="font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">Help Center</a></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
                <li><a href="#" className="hover:text-white">Privacy</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Ravid Clipper. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
} 