import { useState, type FormEvent } from 'react';
import { Terminal, Shield, UserPlus, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AuthScreenProps {
  onLogin: (event: FormEvent) => void | Promise<void>;
  onRegister: (event: FormEvent) => void | Promise<void>;
}

export default function AuthScreen({ onLogin, onRegister }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  return (
    <div className="crt min-h-screen bg-black text-green-500 font-mono p-4 flex flex-col items-center justify-center overflow-hidden relative">
      {/* Scanline effect */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-50 bg-[length:100%_2px,3px_100%]" />
      <div className="fixed inset-0 pointer-events-none animate-pulse bg-green-500/5 z-40" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="border-2 border-green-500 p-6 md:p-10 max-w-lg w-full bg-black/90 relative z-10 shadow-[0_0_30px_rgba(34,197,94,0.3)]"
      >
        <div className="mb-8 text-center">
          <h1 className="text-xl md:text-2xl font-bold flex items-center justify-center gap-3 mb-2 tracking-tighter">
            <Terminal className="w-8 h-8" /> ROBCO INDUSTRIES (TM)
          </h1>
          <div className="text-[10px] opacity-60 uppercase tracking-widest border-y border-green-900 py-1">
            Unified Operating System v7.1.0.4
          </div>
        </div>

        <div className="flex gap-4 mb-8">
          <button 
            onClick={() => setMode('login')}
            className={`flex-1 py-2 text-sm flex items-center justify-center gap-2 transition-all ${
              mode === 'login' ? 'bg-green-500 text-black font-bold' : 'border border-green-900 hover:bg-green-950'
            }`}
          >
            <LogIn className="w-4 h-4" /> LOGIN
          </button>
          <button 
            onClick={() => setMode('register')}
            className={`flex-1 py-2 text-sm flex items-center justify-center gap-2 transition-all ${
              mode === 'register' ? 'bg-green-500 text-black font-bold' : 'border border-green-900 hover:bg-green-950'
            }`}
          >
            <UserPlus className="w-4 h-4" /> REGISTER
          </button>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'login' ? (
            <motion.form 
              key="login"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onSubmit={onLogin} 
              className="flex flex-col gap-5"
            >
              <div className="space-y-1">
                <label className="text-[10px] uppercase opacity-50">User Identification</label>
                <input 
                  name="username" 
                  placeholder="USERNAME..." 
                  className="w-full bg-black border border-green-500 p-3 text-green-500 outline-none focus:ring-1 focus:ring-green-400 placeholder:text-green-900" 
                  required 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase opacity-50">Security Override Code</label>
                <input 
                  name="password" 
                  type="password" 
                  placeholder="PASSWORD..." 
                  className="w-full bg-black border border-green-500 p-3 text-green-500 outline-none focus:ring-1 focus:ring-green-400 placeholder:text-green-900" 
                  required 
                />
              </div>
              <button type="submit" className="bg-green-500 text-black p-3 font-bold hover:bg-green-400 transition-colors flex items-center justify-center gap-2 mt-2">
                <Shield className="w-5 h-5" /> INITIALIZE SESSION
              </button>
            </motion.form>
          ) : (
            <motion.form 
              key="register"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onSubmit={onRegister} 
              className="flex flex-col gap-5"
            >
              <div className="space-y-1">
                <label className="text-[10px] uppercase opacity-50">New User Identity</label>
                <input 
                  name="username" 
                  placeholder="DESIRED USERNAME..." 
                  className="w-full bg-black border border-green-500 p-3 text-green-500 outline-none focus:ring-1 focus:ring-green-400 placeholder:text-green-900" 
                  required 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase opacity-50">Security Credential</label>
                <input 
                  name="password" 
                  type="password" 
                  placeholder="DESIRED PASSWORD..." 
                  className="w-full bg-black border border-green-500 p-3 text-green-500 outline-none focus:ring-1 focus:ring-green-400 placeholder:text-green-900" 
                  required 
                />
              </div>
              <button type="submit" className="border-2 border-green-500 text-green-500 p-3 font-bold hover:bg-green-900 transition-colors flex items-center justify-center gap-2 mt-2">
                <UserPlus className="w-5 h-5" /> CREATE NEW ACCOUNT
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mt-10 text-[9px] opacity-40 text-center leading-tight uppercase">
          Property of Vault-Tec Corporation. Unauthorized access is punishable by up to 100 years in a correctional facility.
        </div>
      </motion.div>

      {/* Background text elements for flavor */}
      <div className="fixed bottom-4 left-4 text-[10px] opacity-20 hidden md:block">
        CPU: 1.2MHz | RAM: 64KB | OS: UOS 7.1
      </div>
      <div className="fixed bottom-4 right-4 text-[10px] opacity-20 hidden md:block">
        CONNECTION: SECURE (ENCRYPTED)
      </div>
    </div>
  );
}
