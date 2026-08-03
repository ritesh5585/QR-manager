import { NavLink } from 'react-router-dom';
import {
  FiMenu,
  FiList,
  FiLogOut,
} from 'react-icons/fi';
import { FaRegMoneyBillAlt } from "react-icons/fa";
import { MdDashboard } from "react-icons/md";
import { TbReportSearch } from "react-icons/tb";
import { IoQrCodeSharp } from "react-icons/io5";
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { label: 'Dashboard', to: '/admin/dashboard', icon: <MdDashboard /> },
  { label: 'Manage Credits', to: '/admin/managecredits', icon: <FaRegMoneyBillAlt /> },
  { label: 'Manage QRs', to: '/admin/manageQRs', icon: <IoQrCodeSharp /> },
  { label: 'Transactions', to: '/admin/transactions', icon: <FiList /> },
  { label: 'Reports', to: '/admin/report', icon: <TbReportSearch /> },
];

export default function SidebarAdmin({ isOpen, setIsOpen }) {
    const {logout} = useAuth();

    return (
    <>
        {/* Backdrop */}
        {isOpen && (
            <div
                className="fixed inset-0 z-40"
                onClick={() => setIsOpen(false)}
            />
        )}

        {/* Sidebar Panel */}
        <div
            className={`fixed top-0 left-0 h-full w-64 bg-[#f2f2f2] text-gray-800 shadow-lg z-50 transform transition-transform duration-300 ease-in-out ${
                isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        >
        {/* Close Button */}
        <div className="py-4 px-4 sm:px-6 flex items-center gap-4">
            <button
            onClick={() => setIsOpen(false)}
            className="text-gray-700 text-2xl focus:outline-none cursor-pointer"
            >
            <FiMenu />
            </button>
            <h1 className="text-xl font-bold text-gray-700">Admin Panel</h1>
        </div>

        {/* Sidebar content with top links + logout at bottom */}
        <div className="h-[calc(100%-4rem)] flex flex-col justify-between px-4 pb-4 pt-2">
            <nav className="flex flex-col space-y-1">
            {navItems.map((item) => (
                <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2 rounded-md text-sm font-medium transition ${
                    isActive ? 'bg-gray-300' : 'hover:bg-gray-200'
                    }`
                }
                >
                {item.icon}
                {item.label}
                </NavLink>
            ))}
            </nav>

            {/* Logout link at bottom */}
            <NavLink
                onClick={() => logout()}
                className="flex items-center gap-3 px-4 py-2 rounded-md text-sm font-medium transition hover:bg-red-200 text-red-600"
            >
                <FiLogOut />
                Logout
            </NavLink>
        </div>
        </div>
    </>
    );
}
