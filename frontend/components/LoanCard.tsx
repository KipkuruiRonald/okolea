'use client';

import { motion } from 'framer-motion';
import { TrendingUp, Clock, DollarSign } from 'lucide-react';
import GlassCard from './GlassCard';

interface LoanCardProps {
  loanId: string;
  amount: string;
  interestRate: string;
  term: string;
  type: string;
  delay?: number;
}

export default function LoanCard({ loanId, amount, interestRate, term, type, delay = 0 }: LoanCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ y: -8 }}
    >
      <GlassCard gradient>
        {/* Type Badge */}
        <div className="mb-3 flex items-center justify-between">
          <span 
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: '#3E3D39' }}
          >
            {type}
          </span>
        </div>

        {/* Loan ID */}
        <h3 
          className="mb-3 text-base font-bold"
          style={{ color: '#050505' }}
        >
          {loanId}
        </h3>

        {/* Stats Grid - 3 columns */}
        <div className="grid grid-cols-3 gap-3">
          {/* Amount */}
          <div className="flex items-center gap-2">
            <div 
              className="rounded-lg p-1.5"
              style={{ backgroundColor: '#C4A995' }}
            >
              <DollarSign 
                className="h-3 w-3" 
                style={{ color: '#050505' }} 
              />
            </div>
            <div>
              <p className="text-[10px]" style={{ color: '#3E3D39' }}>Amount</p>
              <p 
                className="text-xs font-bold"
                style={{ color: '#050505' }}
              >
                {amount}
              </p>
            </div>
          </div>

          {/* Interest Rate */}
          <div className="flex items-center gap-2">
            <div 
              className="rounded-lg p-1.5"
              style={{ backgroundColor: '#D5BFA4' }}
            >
              <TrendingUp 
                className="h-3 w-3" 
                style={{ color: '#050505' }} 
              />
            </div>
            <div>
              <p className="text-[10px]" style={{ color: '#3E3D39' }}>Rate</p>
              <p 
                className="text-xs font-bold"
                style={{ color: '#050505' }}
              >
                {interestRate}
              </p>
            </div>
          </div>

          {/* Term */}
          <div className="flex items-center gap-2">
            <div 
              className="rounded-lg p-1.5"
              style={{ backgroundColor: '#B4A58B' }}
            >
              <Clock 
                className="h-3 w-3" 
                style={{ color: '#050505' }} 
              />
            </div>
            <div>
              <p className="text-[10px]" style={{ color: '#3E3D39' }}>Term</p>
              <p 
                className="text-xs font-bold"
                style={{ color: '#050505' }}
              >
                {term}
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <motion.a
          href="/myloans"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="mt-4 w-full rounded-xl py-2 text-xs font-medium shadow-lg transition-all duration-300 hover:shadow-xl block text-center"
          style={{ 
            backgroundColor: '#3E3D39', 
            color: '#D4C8B5' 
          }}
        >
          View Details
        </motion.a>
      </GlassCard>
    </motion.div>
  );
}
