import { useState } from 'react';
import SidebarAdmin from '../components/SidebarAdmin';
import HeaderAdmin from '../components/HeaderAdmin';

export default function AdminLayout({ children }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-[#f9f9f9]">
      <HeaderAdmin onToggle={() => setIsOpen(true)} />
      <SidebarAdmin isOpen={isOpen} setIsOpen={setIsOpen} />
      <main className="py-4 px-4 sm:px-6 lg:px-12">{children}</main>
    </div>
  );
}
