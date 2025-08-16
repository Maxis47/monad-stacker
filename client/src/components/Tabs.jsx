import React from 'react';

export default function Tabs({ active, onChange }) {
  const tabs = [
    { id: 'game', label: 'Game' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'profile', label: 'Profile' },
    { id: 'history', label: 'History' },
    { id: 'leaderboard', label: 'Leaderboard' }
  ];
  return (
    <div className="tabs">
      {tabs.map(t => (
        <button
          key={t.id}
          className={'tab ' + (active === t.id ? 'active' : '')}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
