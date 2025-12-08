import React, { useState, useContext } from 'react';
import { NotificationContext } from '../context/NotificationContext';
import { checkPasswordStrength } from '../utils/encryption';

export const PasswordStrengthMeter = ({ password = '' }) => {
  const strength = checkPasswordStrength(password);

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded ${
              i < strength.score ? 'bg-' + strength.color :
              'bg-gray-300'
            }`}
          />
        ))}
      </div>
      <p className={`text-sm font-semibold text-${strength.color}`}>
        Strength: {strength.level}
      </p>
      <p className="text-xs text-gray-600">{strength.feedback}</p>
    </div>
  );
};

export const PasswordInput = ({ value, onChange, placeholder = 'Password' }) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <input
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
      >
        {showPassword ? '👁️' : '👁️‍🗨️'}
      </button>
    </div>
  );
};
