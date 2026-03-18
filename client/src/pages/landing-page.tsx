import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Package,
  Users,
  Clock,
  FileCheck,
  ShoppingBag,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Workflow,
  Shield,
  Zap,
  TrendingUp,
  Menu,
  X,
  AlertTriangle,
  RefreshCw,
  Eye,
  UserCheck,
  Send,
  CheckCheck,
  Search,
  Sparkles,
  Layout,
  Target,
  Layers,
  Navigation
} from "lucide-react";

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const workflowSteps = [
    { id: 1, name: "NEW", description: "Task created", color: "bg-blue-500" },
    { id: 2, name: "TRIAGE", description: "Ready to claim", color: "bg-purple-500" },
    { id: 3, name: "ASSIGNED", description: "Editor claimed", color: "bg-yellow-500" },
    { id: 4, name: "IN PROGRESS", description: "Being worked on", color: "bg-orange-500" },
    { id: 5, name: "REVIEW", description: "Manager approval", color: "bg-cyan-500" },
    { id: 6, name: "PUBLISHED", description: "Live on Shopify", color: "bg-indigo-500" },
    { id: 7, name: "QA", description: "Quality check", color: "bg-green-500" },
    { id: 8, name: "DONE", description: "Complete", color: "bg-gray-500" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
      >
        Skip to main content
      </a>

      {/* Navigation */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Package className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">ShopSync Flow</span>
            </div>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center space-x-8">
              <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                How It Works
              </a>
              <a href="#seo" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                SEO Analyzer
              </a>
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Features
              </a>
              <a href="#workflow" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Workflow
              </a>
            </div>

            <div className="hidden md:flex items-center space-x-4">
              <Link href="/auth">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/register">
                <Button>
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t py-4 space-y-4">
              <a href="#how-it-works" className="block px-2 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>
                How It Works
              </a>
              <a href="#seo" className="block px-2 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>
                SEO Analyzer
              </a>
              <a href="#features" className="block px-2 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>
                Features
              </a>
              <a href="#workflow" className="block px-2 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>
                Workflow
              </a>
              <div className="pt-4 border-t space-y-2">
                <Link href="/auth">
                  <Button variant="ghost" className="w-full justify-start">Sign In</Button>
                </Link>
                <Link href="/register">
                  <Button className="w-full">Start Free Trial</Button>
                </Link>
              </div>
            </div>
          )}
        </nav>
      </header>

      <main id="main-content">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10" />
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 relative">
            <div className="max-w-4xl mx-auto text-center">
              {/* Badge */}
              <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-8">
                <ShoppingBag className="h-4 w-4 mr-2" />
                For Shopify Retailers & Agencies
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-6">
                Stop Losing Products in
                <span className="text-primary"> Spreadsheets & Emails</span>
              </h1>

              {/* Subheadline */}
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
                ShopSync Flow is the workflow management system that takes your Shopify products
                from intake to published — with full visibility, team collaboration, and zero chaos.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <Link href="/register">
                  <Button size="lg" className="w-full sm:w-auto text-lg px-8">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <a href="#how-it-works">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg px-8">
                    See How It Works
                  </Button>
                </a>
              </div>

              {/* Trust Indicators */}
              <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span>14-day free trial</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span>Cancel anytime</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problem Section */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                Sound Familiar?
              </h2>
              <p className="text-lg text-muted-foreground">
                Managing Shopify product uploads shouldn't feel like herding cats.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              <Card className="p-6 border-destructive/20 bg-destructive/5">
                <AlertTriangle className="h-10 w-10 text-destructive mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  "Where's that product?"
                </h3>
                <p className="text-muted-foreground">
                  Products get lost in email threads, spreadsheets, and shared drives.
                  No one knows what stage each item is in.
                </p>
              </Card>

              <Card className="p-6 border-destructive/20 bg-destructive/5">
                <AlertTriangle className="h-10 w-10 text-destructive mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  "Who's working on what?"
                </h3>
                <p className="text-muted-foreground">
                  Team members duplicate work or tasks fall through the cracks
                  because there's no clear assignment system.
                </p>
              </Card>

              <Card className="p-6 border-destructive/20 bg-destructive/5">
                <AlertTriangle className="h-10 w-10 text-destructive mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  "When was this changed?"
                </h3>
                <p className="text-muted-foreground">
                  No audit trail means you can't track who did what,
                  when it happened, or why products went wrong.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* Solution Section */}
        <section className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-12">
              <div className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 px-4 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 mb-4">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                The Solution
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                One System. Complete Visibility. Zero Chaos.
              </h2>
              <p className="text-lg text-muted-foreground">
                ShopSync Flow gives your team a single source of truth for every product —
                from the moment it's created to when it's live on Shopify.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Workflow className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Kanban Workflow</h3>
                <p className="text-muted-foreground">
                  Visual board shows every product's status at a glance.
                  Drag-and-drop to move items through your pipeline.
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Users className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Team Collaboration</h3>
                <p className="text-muted-foreground">
                  Assign tasks, set deadlines, and track who's working on what.
                  Role-based permissions keep everyone focused.
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <ShoppingBag className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Shopify Sync</h3>
                <p className="text-muted-foreground">
                  Publish directly to your Shopify store. Sync products, collections,
                  and vendors automatically.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SEO Built-In Section */}
        <section id="seo" className="py-20 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-12">
              <div className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/50 px-4 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 mb-4">
                <Search className="h-4 w-4 mr-2" />
                Built-In SEO Analyzer
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                SEO Optimization — No Expert Required
              </h2>
              <p className="text-lg text-muted-foreground">
                Stop paying SEO consultants. ShopSync Flow guides anyone on your team to create
                Google-friendly products, collections, and navigation — automatically.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-12">
              <Card className="p-6 border-green-200 dark:border-green-800 bg-white/80 dark:bg-background/80">
                <div className="w-14 h-14 bg-green-100 dark:bg-green-900/50 rounded-2xl flex items-center justify-center mb-4">
                  <Package className="h-7 w-7 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Product SEO</h3>
                <p className="text-muted-foreground mb-4">
                  Real-time guidance for titles, descriptions, and meta tags.
                  Built-in rules ensure every product is optimized for organic Google search.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Title length & keyword placement</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Meta description optimization</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Alt text suggestions for images</li>
                </ul>
              </Card>

              <Card className="p-6 border-green-200 dark:border-green-800 bg-white/80 dark:bg-background/80">
                <div className="w-14 h-14 bg-green-100 dark:bg-green-900/50 rounded-2xl flex items-center justify-center mb-4">
                  <Layers className="h-7 w-7 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Collection SEO</h3>
                <p className="text-muted-foreground mb-4">
                  Optimize your collection pages for search engines. Get instant feedback on
                  collection titles, descriptions, and URL handles.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Collection title best practices</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> URL handle optimization</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Collection description scoring</li>
                </ul>
              </Card>

              <Card className="p-6 border-green-200 dark:border-green-800 bg-white/80 dark:bg-background/80">
                <div className="w-14 h-14 bg-green-100 dark:bg-green-900/50 rounded-2xl flex items-center justify-center mb-4">
                  <Navigation className="h-7 w-7 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Navigation SEO</h3>
                <p className="text-muted-foreground mb-4">
                  Build site navigation that both users and search engines love. Analyze menu
                  structure for crawlability and user experience.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Menu depth analysis</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Internal linking suggestions</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Navigation hierarchy checks</li>
                </ul>
              </Card>
            </div>

            {/* No Expert Needed Banner */}
            <div className="max-w-4xl mx-auto">
              <Card className="p-8 border-2 border-green-300 dark:border-green-700 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="w-20 h-20 bg-green-200 dark:bg-green-800 rounded-full flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-10 w-10 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-center md:text-left">
                    <h3 className="text-2xl font-bold text-foreground mb-2">
                      Anyone Can Do SEO Now
                    </h3>
                    <p className="text-muted-foreground text-lg">
                      No need to hire SEO specialists or train your team on complex rules.
                      ShopSync Flow's built-in analyzer guides every user — from new hires to managers —
                      through best practices as they work. <span className="font-semibold text-green-700 dark:text-green-400">Just follow the green checkmarks.</span>
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-20 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                How It Works
              </h2>
              <p className="text-lg text-muted-foreground">
                Get your team organized in three simple steps
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Step 1 */}
              <div className="relative">
                <div className="flex items-center justify-center w-12 h-12 bg-primary text-primary-foreground rounded-full text-xl font-bold mb-6">
                  1
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  Create Tasks
                </h3>
                <p className="text-muted-foreground">
                  Managers create product tasks with details, images, and deadlines.
                  Tasks automatically enter the workflow pipeline.
                </p>
              </div>

              {/* Step 2 */}
              <div className="relative">
                <div className="flex items-center justify-center w-12 h-12 bg-primary text-primary-foreground rounded-full text-xl font-bold mb-6">
                  2
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  Team Works
                </h3>
                <p className="text-muted-foreground">
                  Editors claim tasks, update product info, and submit for review.
                  Built-in limits prevent overload (max 2 active tasks per editor).
                </p>
              </div>

              {/* Step 3 */}
              <div className="relative">
                <div className="flex items-center justify-center w-12 h-12 bg-primary text-primary-foreground rounded-full text-xl font-bold mb-6">
                  3
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  Publish to Shopify
                </h3>
                <p className="text-muted-foreground">
                  Approved products publish directly to your Shopify store.
                  QA verification ensures quality before marking complete.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Workflow Visualization */}
        <section id="workflow" className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                8-Stage Workflow
              </h2>
              <p className="text-lg text-muted-foreground">
                Every product follows the same proven path from creation to completion
              </p>
            </div>

            {/* Workflow Steps - Horizontal on desktop, vertical on mobile */}
            <div className="max-w-6xl mx-auto">
              <div className="hidden md:flex items-center justify-between relative">
                {/* Connection Line */}
                <div className="absolute top-6 left-8 right-8 h-1 bg-border" />

                {workflowSteps.map((step, index) => (
                  <div key={step.id} className="relative flex flex-col items-center z-10">
                    <div className={`w-12 h-12 ${step.color} rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                      {step.id}
                    </div>
                    <div className="mt-3 text-center">
                      <p className="text-sm font-semibold text-foreground">{step.name}</p>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mobile version - 2 columns */}
              <div className="md:hidden grid grid-cols-2 gap-4">
                {workflowSteps.map((step) => (
                  <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className={`w-10 h-10 ${step.color} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>
                      {step.id}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{step.name}</p>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Workflow Benefits */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-16">
              <Card className="p-5 text-center">
                <Clock className="h-8 w-8 text-primary mx-auto mb-3" />
                <h4 className="font-semibold text-foreground mb-1">48-Hour SLA</h4>
                <p className="text-sm text-muted-foreground">Tasks auto-return to pool if not started within 48 hours</p>
              </Card>
              <Card className="p-5 text-center">
                <UserCheck className="h-8 w-8 text-primary mx-auto mb-3" />
                <h4 className="font-semibold text-foreground mb-1">2-Task Limit</h4>
                <p className="text-sm text-muted-foreground">Prevents overload — editors can only claim 2 active tasks</p>
              </Card>
              <Card className="p-5 text-center">
                <FileCheck className="h-8 w-8 text-primary mx-auto mb-3" />
                <h4 className="font-semibold text-foreground mb-1">Full Audit Trail</h4>
                <p className="text-sm text-muted-foreground">Every change logged with user, timestamp, and details</p>
              </Card>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                Built for Retail Teams
              </h2>
              <p className="text-lg text-muted-foreground">
                Everything you need to manage Shopify products at scale
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              <Card className="p-6">
                <Shield className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Role-Based Access</h3>
                <p className="text-muted-foreground">
                  4 roles with specific permissions: SuperAdmin, Manager, Editor, Auditor.
                  Each sees only what they need.
                </p>
              </Card>

              <Card className="p-6">
                <BarChart3 className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Real-Time Analytics</h3>
                <p className="text-muted-foreground">
                  Dashboard shows task completion rates, SLA performance,
                  and team productivity at a glance.
                </p>
              </Card>

              <Card className="p-6">
                <RefreshCw className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Shopify Sync</h3>
                <p className="text-muted-foreground">
                  Two-way sync with your Shopify store. Products, collections,
                  and vendors stay in sync automatically.
                </p>
              </Card>

              <Card className="p-6">
                <Eye className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Complete Visibility</h3>
                <p className="text-muted-foreground">
                  See every product's status, who's working on it,
                  and how long it's been in each stage.
                </p>
              </Card>

              <Card className="p-6">
                <Zap className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Time Tracking</h3>
                <p className="text-muted-foreground">
                  Automatic lead time and cycle time calculations
                  help identify bottlenecks and optimize processes.
                </p>
              </Card>

              <Card className="p-6">
                <TrendingUp className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Multi-Store Support</h3>
                <p className="text-muted-foreground">
                  Manage multiple Shopify stores from one dashboard.
                  Perfect for agencies and multi-brand retailers.
                </p>
              </Card>

              <Card className="p-6 border-2 border-primary/30 bg-primary/5">
                <Layout className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Familiar Shopify Look</h3>
                <p className="text-muted-foreground">
                  Interface mirrors Shopify's design patterns. Your team feels at home
                  instantly — zero learning curve, immediate productivity.
                </p>
              </Card>

              <Card className="p-6 border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20">
                <Search className="h-10 w-10 text-green-600 dark:text-green-400 mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Built-In SEO Analyzer</h3>
                <p className="text-muted-foreground">
                  Every product, collection, and menu gets SEO guidance. Follow the green checkmarks —
                  no SEO expertise required.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* Roles Section */}
        <section className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                A Role for Everyone
              </h2>
              <p className="text-lg text-muted-foreground">
                Each team member gets exactly the tools they need
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              <Card className="p-6 border-2 border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                    <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Warehouse Managers</h3>
                    <p className="text-sm text-muted-foreground">Create & approve tasks</p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-500" /> Create and assign product tasks</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-500" /> Review and approve completed work</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-500" /> Publish products to Shopify</li>
                </ul>
              </Card>

              <Card className="p-6 border-2 border-green-200 dark:border-green-800">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                    <Zap className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Editors</h3>
                    <p className="text-sm text-muted-foreground">Do the work</p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Self-assign tasks from queue</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Edit product details and images</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Submit for review when done</li>
                </ul>
              </Card>

              <Card className="p-6 border-2 border-purple-200 dark:border-purple-800">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                    <FileCheck className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Auditors</h3>
                    <p className="text-sm text-muted-foreground">Quality control</p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-purple-500" /> Read-only access to all tasks</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-purple-500" /> QA approval for published items</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-purple-500" /> Full audit log access</li>
                </ul>
              </Card>

              <Card className="p-6 border-2 border-red-200 dark:border-red-800">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">SuperAdmins</h3>
                    <p className="text-sm text-muted-foreground">Full control</p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-red-500" /> Manage users and permissions</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-red-500" /> Configure Shopify connections</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-red-500" /> Access all analytics and reports</li>
                </ul>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto bg-gradient-to-r from-primary to-primary/80 rounded-3xl p-12 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">
                Ready to Organize Your Product Workflow?
              </h2>
              <p className="text-lg text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
                Join retail teams who've replaced spreadsheet chaos with streamlined workflows.
                Start your free trial today.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/register">
                  <Button size="lg" variant="secondary" className="text-lg px-8">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/auth">
                  <Button size="lg" variant="outline" className="text-lg px-8 bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10">
                    Sign In
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Package className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="text-lg font-bold text-foreground">ShopSync Flow</span>
              </div>
              <p className="text-sm text-muted-foreground">
                The workflow management system for Shopify retailers.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#workflow" className="hover:text-foreground transition-colors">Workflow</a></li>
                <li><a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/auth" className="hover:text-foreground transition-colors">About</Link></li>
                <li><Link href="/auth" className="hover:text-foreground transition-colors">Contact</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/auth" className="hover:text-foreground transition-colors">Privacy</Link></li>
                <li><Link href="/auth" className="hover:text-foreground transition-colors">Terms</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t mt-12 pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} ShopSync Flow. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
