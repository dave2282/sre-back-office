import React from 'react';
import { base44 } from '@/api/base44Client';

const UserNotRegisteredError = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg border border-slate-100">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-orange-100">
            <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Account Not Set Up Yet</h1>
          <p className="text-slate-600 mb-4">
            Your login was recognized, but your agent profile has not been created in the system yet.
          </p>
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-md text-sm text-blue-800 mb-4">
            <p className="font-semibold mb-1">Action needed by your admin:</p>
            <p>Ask your administrator to add you to the <strong>Agent Roster</strong> using the same email address you used to log in.</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-md text-sm text-slate-600">
            <p>In the meantime, you can:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Confirm you're logged in with the correct email</li>
              <li>Try logging out and back in after your admin adds you</li>
            </ul>
          </div>
          <button onClick={() => base44.auth.logout()} className="mt-6 text-sm font-medium text-slate-700 underline">Sign out</button>
        </div>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;