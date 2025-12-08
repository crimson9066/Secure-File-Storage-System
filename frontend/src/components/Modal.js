import React, { useContext } from 'react';
import { NotificationContext } from '../context/NotificationContext';

export const Modal = ({ isOpen, title, onClose, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center">
      <div className={`bg-white rounded-lg shadow-2xl ${sizeClasses[size]} w-full mx-4 fade-in`}>
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>
        <div className="p-6 max-h-96 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

export const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, isDangerous = false }) => {
  return (
    <Modal isOpen={isOpen} title={title} onClose={onCancel} size="sm">
      <p className="mb-6 text-gray-700">{message}</p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 font-semibold"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={`flex-1 px-4 py-2 text-white rounded-lg font-semibold ${
            isDangerous ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          Confirm
        </button>
      </div>
    </Modal>
  );
};
