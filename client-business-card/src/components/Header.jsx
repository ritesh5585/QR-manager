import { FiMenu } from 'react-icons/fi';

export default function Header({ onToggle }) {

    return (
        <header className="bg-white shadow-sm py-4 px-4 sm:px-6 lg:px-12 h-[9dvh] flex justify-between items-center border-b w-full sticky top-0 z-40">
            <div className="flex items-center gap-4">
            <button
                onClick={onToggle}
                className="text-blue-700 text-2xl focus:outline-none cursor-pointer"
            >
                <FiMenu />
            </button>
            <h1 className="text-xl font-bold text-blue-700">User Panel</h1>
            </div>
            <div className="text-sm text-gray-500">Welcome, User</div>
        </header>
    );
}
