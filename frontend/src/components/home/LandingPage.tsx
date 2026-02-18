"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-black mb-4">Teek</h1>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            Professional video clipping platform powered by AI
          </p>

          <div className="flex gap-4 justify-center mb-16">
            <Link href="/sign-up">
              <Button size="lg" className="px-8 py-3">
                Get Started
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button variant="outline" size="lg" className="px-8 py-3">
                Sign In
              </Button>
            </Link>
          </div>
        </div>

        <Separator className="my-16" />

        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-black mb-2">AI Analysis</h3>
            <p className="text-gray-600">
              Advanced content analysis for optimal clip extraction
            </p>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-black mb-2">Fast Processing</h3>
            <p className="text-gray-600">
              Enterprise-grade infrastructure for rapid video processing
            </p>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-black mb-2">Secure Platform</h3>
            <p className="text-gray-600">
              Enterprise security standards with private processing
            </p>
          </div>
        </div>

        <Separator className="my-16" />

        {/* How It Works Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-black text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                1
              </div>
              <h4 className="font-semibold text-black mb-2">Upload</h4>
              <p className="text-gray-600 text-sm">
                Upload your video file or provide a direct video URL to get started
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                2
              </div>
              <h4 className="font-semibold text-black mb-2">AI Analysis</h4>
              <p className="text-gray-600 text-sm">
                Our AI analyzes your content to identify the most engaging moments
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                3
              </div>
              <h4 className="font-semibold text-black mb-2">Customize</h4>
              <p className="text-gray-600 text-sm">
                Add subtitles with custom fonts, colors, and styling options
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                4
              </div>
              <h4 className="font-semibold text-black mb-2">Download</h4>
              <p className="text-gray-600 text-sm">
                Get your viral-ready clips optimized for TikTok, Instagram, and more
              </p>
            </div>
          </div>
        </div>

        <Separator className="my-16" />

        {/* Features Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-black text-center mb-12">Powerful Features</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-6 rounded-lg border bg-gray-50">
              <h4 className="font-semibold text-black mb-2">Smart Clip Detection</h4>
              <p className="text-gray-600">
                AI-powered analysis identifies the most viral-worthy moments from your videos automatically.
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-gray-50">
              <h4 className="font-semibold text-black mb-2">Custom Subtitles</h4>
              <p className="text-gray-600">
                Style your subtitles with custom fonts, colors, strokes, and shadows to match your brand.
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-gray-50">
              <h4 className="font-semibold text-black mb-2">Multi-Platform Ready</h4>
              <p className="text-gray-600">
                Generate clips optimized for TikTok, Instagram Reels, YouTube Shorts, and more.
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-gray-50">
              <h4 className="font-semibold text-black mb-2">Batch Processing</h4>
              <p className="text-gray-600">
                Process multiple videos simultaneously and generate dozens of clips in minutes.
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-gray-50">
              <h4 className="font-semibold text-black mb-2">Transcript Editing</h4>
              <p className="text-gray-600">
                Review and edit transcripts before clip generation for perfect accuracy.
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-gray-50">
              <h4 className="font-semibold text-black mb-2">Cloud Storage</h4>
              <p className="text-gray-600">
                All your clips are securely stored in the cloud for easy access and sharing.
              </p>
            </div>
          </div>
        </div>

        <Separator className="my-16" />

        {/* Pricing Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-black text-center mb-4">Simple Pricing</h2>
          <p className="text-gray-600 text-center mb-12 max-w-xl mx-auto">
            Choose the plan that works best for your content creation needs
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Free Plan */}
            <div className="p-6 rounded-lg border bg-white">
              <h3 className="text-xl font-semibold text-black mb-2">Free</h3>
              <p className="text-gray-600 text-sm mb-4">Perfect for getting started</p>
              <div className="text-4xl font-bold text-black mb-6">
                $0<span className="text-lg font-normal text-gray-600">/mo</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  5 clips per month
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  720p quality
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Basic subtitle styles
                </li>
                <li className="flex items-center gap-2 text-gray-400">
                  <CheckCircle className="w-4 h-4 text-gray-300" />
                  Teek watermark
                </li>
              </ul>
              <Link href="/sign-up">
                <Button variant="outline" className="w-full">
                  Get Started
                </Button>
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="p-6 rounded-lg border-2 border-gray-900 bg-gray-50 relative">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs font-semibold px-3 py-1 rounded-full">
                MOST POPULAR
              </div>
              <h3 className="text-xl font-semibold text-black mb-2">Pro</h3>
              <p className="text-gray-600 text-sm mb-4">For serious creators</p>
              <div className="text-4xl font-bold text-black mb-6">
                $19<span className="text-lg font-normal text-gray-600">/mo</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  50 clips per month
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  1080p quality
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Advanced subtitle styles
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  No watermark
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Priority processing
                </li>
              </ul>
              <Link href="/sign-up">
                <Button className="w-full">Start Free Trial</Button>
              </Link>
            </div>

            {/* Business Plan */}
            <div className="p-6 rounded-lg border bg-white">
              <h3 className="text-xl font-semibold text-black mb-2">Business</h3>
              <p className="text-gray-600 text-sm mb-4">For teams and agencies</p>
              <div className="text-4xl font-bold text-black mb-6">
                $49<span className="text-lg font-normal text-gray-600">/mo</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Unlimited clips
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  4K quality
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Custom fonts & branding
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  API access
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Team collaboration
                </li>
              </ul>
              <Link href="/sign-up">
                <Button variant="outline" className="w-full">
                  Contact Sales
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <Separator className="my-16" />

        {/* CTA Section */}
        <div className="text-center py-12 px-6 rounded-2xl bg-gray-900 text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Create Viral Content?</h2>
          <p className="text-lg text-gray-300 mb-8 max-w-xl mx-auto">
            Join thousands of creators who use Teek to transform long videos into engaging short-form content.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/sign-up">
              <Button size="lg" className="px-8 py-3 bg-white text-black hover:bg-gray-100">
                Start Creating Free
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button variant="outline" size="lg" className="px-8 py-3 border-white text-white hover:bg-white/10">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
