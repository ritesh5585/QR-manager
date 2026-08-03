import { useState } from 'react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

export default function GlobalLayout({ children }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-[#f9f9f9]">
      <Header onToggle={() => setIsOpen(true)} />
      <Sidebar isOpen={isOpen} setIsOpen={setIsOpen} />
      <main className="py-4 px-4 sm:px-6 lg:px-12">{children}</main>
    </div>
  );
}