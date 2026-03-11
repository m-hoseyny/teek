"use client";

import Link from "next/link";
import { Zap, Play, Sparkles, Video, TrendingUp, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NewLandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Navigation */}
        <nav className="relative z-10 border-b border-sidebar-border bg-card/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-purple flex items-center justify-center glow-purple">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Teek Studio</h1>
                <p className="text-xs text-blue-400">VIDEO OPTIMIZER</p>
              </div>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/sign-in">
                <Button variant="outline" className="border-border hover:border-primary">
                  Sign In
                </Button>
              </Link>
              <Link href="/sign-up">
                <Button className="bg-gradient-purple hover:bg-gradient-purple-hover glow-purple">
                  Start Free
                </Button>
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-blue-500/30 mb-8">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-gray-300">AI-Powered Viral Video Analysis</span>
            </div>

            <h1 className="text-6xl font-bold text-white mb-6 leading-tight">
              Transform Long Videos into
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                Viral Clips
              </span>
            </h1>

            <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
              Our AI identifies the most engaging moments in your content, creates perfectly cropped vertical clips,
              and adds stunning captions—all automatically.
            </p>

            <div className="flex items-center justify-center gap-4">
              <Link href="/sign-up">
                <Button size="lg" className="h-14 px-8 bg-gradient-purple hover:bg-gradient-purple-hover glow-purple-strong text-lg font-semibold">
                  <Zap className="w-5 h-5 mr-2" fill="currentColor" />
                  Start Analyzing Free
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="h-14 px-8 border-border hover:border-primary">
                <Play className="w-5 h-5 mr-2" />
                Watch Demo
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mt-6">
              No credit card required • 3 free analyses • Cancel anytime
            </p>
          </div>
        </div>

        {/* Background Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/20 blur-[120px] rounded-full"></div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Powered by Advanced AI</h2>
          <p className="text-xl text-gray-400">Everything you need to create viral content, automatically</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="glass rounded-2xl p-8 border border-border hover:border-primary transition-all group">
            <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center mb-6 group-hover:glow-purple transition-all">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">AI Viral Detection</h3>
            <p className="text-gray-400 leading-relaxed">
              Our AI analyzes your video's sentiment, pacing, and content to identify the moments with the highest
              viral potential.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="glass rounded-2xl p-8 border border-border hover:border-primary transition-all group">
            <div className="w-14 h-14 rounded-xl bg-secondary/20 flex items-center justify-center mb-6 group-hover:glow-purple transition-all">
              <Video className="w-7 h-7 text-secondary" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Smart Cropping</h3>
            <p className="text-gray-400 leading-relaxed">
              Automatically crops your videos to 9:16, 1:1, or 16:9 with face tracking to keep the subject perfectly
              centered.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="glass rounded-2xl p-8 border border-border hover:border-primary transition-all group">
            <div className="w-14 h-14 rounded-xl bg-green-400/20 flex items-center justify-center mb-6 group-hover:glow-purple transition-all">
              <TrendingUp className="w-7 h-7 text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Viral Captions</h3>
            <p className="text-gray-400 leading-relaxed">
              Word-timed captions with customizable styles proven to increase engagement by 40% on social platforms.
            </p>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">How It Works</h2>
          <p className="text-xl text-gray-400">From upload to viral clip in minutes</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {[
            { step: "1", title: "Upload Video", desc: "Paste a URL or upload your video file" },
            { step: "2", title: "AI Analysis", desc: "Our AI identifies viral moments and creates clips" },
            { step: "3", title: "Customize", desc: "Adjust captions, aspect ratios, and styles" },
            { step: "4", title: "Export & Share", desc: "Download and share to your platforms" },
          ].map((item, index) => (
            <div key={index} className="relative">
              <div className="glass rounded-2xl p-6 border border-border">
                <div className="w-12 h-12 rounded-full bg-gradient-purple text-white font-bold text-xl flex items-center justify-center mb-4 glow-purple">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-gray-400">{item.desc}</p>
              </div>
              {index < 3 && (
                <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-gradient-purple"></div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Simple Pricing</h2>
          <p className="text-xl text-gray-400">Choose the plan that fits your needs</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Free */}
          <div className="glass rounded-2xl p-8 border border-border">
            <h3 className="text-2xl font-bold text-white mb-2">Free</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-white">$0</span>
              <span className="text-gray-400">/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {["3 videos/month", "720p exports", "Basic captions", "Community support"].map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-gray-300">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button variant="outline" className="w-full border-border hover:border-primary">
              Get Started
            </Button>
          </div>

          {/* Pro */}
          <div className="glass rounded-2xl p-8 border-2 border-primary glow-purple relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-purple text-white text-sm font-semibold">
              POPULAR
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Pro</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-white">$19</span>
              <span className="text-gray-400">/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {["50 videos/month", "4K exports", "All caption styles", "Priority support", "Custom fonts"].map(
                (feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-gray-300">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    {feature}
                  </li>
                )
              )}
            </ul>
            <Button className="w-full bg-gradient-purple hover:bg-gradient-purple-hover glow-purple">
              Start Pro Trial
            </Button>
          </div>

          {/* Business */}
          <div className="glass rounded-2xl p-8 border border-border">
            <h3 className="text-2xl font-bold text-white mb-2">Business</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-white">$49</span>
              <span className="text-gray-400">/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {["Unlimited videos", "8K exports", "API access", "Dedicated support", "Team collaboration"].map(
                (feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-gray-300">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                    {feature}
                  </li>
                )
              )}
            </ul>
            <Button variant="outline" className="w-full border-border hover:border-primary">
              Contact Sales
            </Button>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="glass rounded-3xl p-12 border border-blue-500/30 glow-purple">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to Go Viral?</h2>
          <p className="text-xl text-gray-400 mb-8">
            Join thousands of creators using AI to create engaging content
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="h-14 px-8 bg-gradient-purple hover:bg-gradient-purple-hover glow-purple-strong text-lg font-semibold">
              <Zap className="w-5 h-5 mr-2" fill="currentColor" />
              Start Your Free Trial
            </Button>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-sidebar-border py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>© 2026 Teek Studio. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
