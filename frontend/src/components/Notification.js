import React, { useContext } from 'react';
import { NotificationContext } from '../context/NotificationContext';

export const Notification = () => {
  const { notifications, removeNotification } = useContext(NotificationContext);

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {notifications.map((notif) => (
        <div
          key={notif.id}
          className={`p-4 rounded-lg shadow-lg text-white fade-in flex items-center justify-between ${
            notif.type === 'error' ? 'bg-red-500' :
            notif.type === 'success' ? 'bg-green-500' :
            notif.type === 'warning' ? 'bg-yellow-500' :
            'bg-blue-500'
          }`}
        >
          <span>{notif.message}</span>
          <button
            onClick={() => removeNotification(notif.id)}
            className="ml-4 text-white hover:text-gray-200 font-bold"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
