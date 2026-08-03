import GlobalLayout from '../layouts/GlobalLayout';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { RiResetRightLine } from "react-icons/ri";
import { FiSearch, FiChevronDown, FiChevronUp } from "react-icons/fi";

export default function AdminTransaction() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [type, setType] = useState('');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    async function fetchTransactions() {
      setIsLoading(true);
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/credits/transactions?userObjId=${user.objId}`
        );
        setTransactions(res.data.transactions);
        setFilteredTransactions(res.data.transactions);
      } catch (err) {
        toast.error('Failed to load transactions', { id: 'load-error' });
      } finally {
        setIsLoading(false);
      }
    }

    if (user?.objId) fetchTransactions();
  }, [user]);

  useEffect(() => {
    let filtered = [...transactions];

    if (fromDate) {
      const from = new Date(fromDate);
      filtered = filtered.filter((tx) => new Date(tx.createdAt) >= from);
    }

    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((tx) => new Date(tx.createdAt) <= to);
    }

    if (type) {
      filtered = filtered.filter((tx) => tx.type === type);
    }

    if (userId) {
        filtered = filtered.filter((tx) => 
          tx.targetUser?.id?.toLowerCase().includes(userId.toLowerCase()) || 
          tx.performer?.id?.toLowerCase().includes(userId.toLowerCase())
        );
    }

    setFilteredTransactions(filtered);
  }, [fromDate, toDate, type, userId, transactions]);

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(
      filteredTransactions.map((tx) => ({
        Date: new Date(tx.createdAt).toLocaleDateString(),
        Time: new Date(tx.createdAt).toLocaleTimeString(),
        Type: tx.type,
        Amount: tx.type === 'issue' || 
               (tx.type === 'reclaim' && tx.performer?.userObjId === user.objId) || 
               (tx.type === 'allocation' && tx.targetUser?.userObjId === user.objId)
                ? `+${tx.actualAmount}`
                : `-${tx.actualAmount}`,
        Performer: tx.performer?.userObjId === user.objId ? 'You' : tx.performer?.userObjId,
        TargetUser: tx.targetUser?.id === user.id ? 'You' : tx.targetUser?.id || 'N/A',
      }))
    );

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');
    XLSX.writeFile(workbook, 'transactions.xlsx');
  };

  const getTypeLabel = (type) => {
    const base = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium';
    switch (type) {
      case 'issue': return `${base} bg-green-100 text-green-800`;
      case 'allocation': return `${base} bg-blue-100 text-blue-800`;
      case 'use': return `${base} bg-yellow-100 text-yellow-800`;
      case 'reclaim': return `${base} bg-red-100 text-red-800`;
      default: return `${base} bg-gray-100 text-gray-800`;
    }
  };

  const clearFilters = () => {
    setFromDate("");
    setToDate("");
    setType("");
    setUserId("");
  };

  return (
    <GlobalLayout>
      <div className="space-y-3 md:space-y-6">
        <div className="mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Credit Transactions</h2>
          <p className="text-sm sm:text-md text-gray-500 mt-1">All credit operations related to you</p>
        </div>

        {/* Mobile Filters Toggle */}
        <div className="flex items-center gap-2 sm:hidden">
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="w-full flex items-center justify-between bg-white px-2 py-1 rounded-lg border border-gray-300 shadow-sm"
          >
            <span className="font-medium">Filters</span>
            {showMobileFilters ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
          </button>
          <div className="sm:hidden flex justify-center">
            <button
              onClick={clearFilters}
              className="whitespace-nowrap px-2 py-1 text-sm text-gray-700 bg-gray-300 hover:bg-gray-200 rounded-lg flex items-center gap-2"
            >
              <RiResetRightLine size={16} />
              Reset Filters
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className={`${showMobileFilters ? 'block' : 'hidden'} sm:block bg-white shadow-sm p-4 rounded-xl`}>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-[1fr_1fr_2fr_1fr_auto]">
            {/* User ID Search */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FiSearch className="text-gray-400" />
              </div>
              <input
                id="userId"
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Search by User ID"
                className="pl-10 pr-4 py-1 sm:py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Type Selector */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <label htmlFor="type" className="text-sm font-medium text-gray-700 whitespace-nowrap">Type</label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1 sm:py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Types</option>
                <option value="issue">Issue</option>
                <option value="allocation">Allocation</option>
                <option value="use">Use</option>
                <option value="reclaim">Reclaim</option>
              </select>
            </div>

            <div className='flex items-center gap-2'>
              {/* From Date */}
              <div className="w-full flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <label htmlFor="fromDate" className="text-sm font-medium text-gray-700 whitespace-nowrap">From</label>
                <input
                  id="fromDate"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1 sm:py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* To Date */}
              <div className="w-full flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <label htmlFor="toDate" className="text-sm font-medium text-gray-700 whitespace-nowrap">To</label>
                <input
                  id="toDate"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1 sm:py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Export Button */}
            <div className="flex items-center">
              <button
                onClick={exportToExcel}
                className="w-full px-4 py-1 sm:py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download Excel</span>
              </button>
            </div>

            {/* Reset Icon - Hidden on mobile */}
            <div className="hidden md:flex items-center">
              <div className="w-fit">
                <button
                  onClick={clearFilters}
                  title="Reset all filters"
                  className="flex items-center justify-center cursor-pointer"
                >
                  <RiResetRightLine color="#7b6c65" size={30} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="relative overflow-auto sm:max-h-[calc(100vh-280px)]">
            {/* Desktop Table */}
            <table className="hidden sm:table min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Performer</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Target User</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-center">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
                      </div>
                    </td>
                  </tr>
                ) : filteredTransactions.length > 0 ? (
                  filteredTransactions.map((tx) => (
                    <tr key={tx._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(tx.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <span className={getTypeLabel((tx.targetUser.userObjId === user.objId && tx.type === "allocation") ? "issue" :  tx.type)}>
                          {(tx.targetUser.userObjId === user.objId && tx.type === "allocation") ? "Issue" : tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center text-sm font-medium">
                        {tx.type === 'issue' || 
                         (tx.type === 'reclaim' && tx.performer?.userObjId === user.objId) || 
                         (tx.type === 'allocation' && tx.targetUser?.userObjId === user.objId) ? (
                          <span className="text-green-600 font-semibold">+{tx.actualAmount}</span>
                        ) : (
                          <span className="text-red-600 font-semibold">-{tx.actualAmount}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {tx.performer?.userObjId === user.objId ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                            You
                          </span>
                        ) : (
                          (tx.performer?.id) ? tx.performer?.id : tx.performer?.userObjId
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {tx.targetUser?.id === user.id ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                            You
                          </span>
                        ) : (
                          tx.targetUser?.id || 'QR'
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        <p className="text-gray-500 font-medium">No transactions found</p>
                        <p className="text-gray-400 text-sm">Try adjusting your filters</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Mobile Cards */}
            <div className="sm:hidden space-y-3 p-3">
              {isLoading ? (
                <div className="flex justify-center p-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
                </div>
              ) : filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx) => (
                  <MobileTransactionCard key={tx._id} tx={tx} user={user} />
                ))
              ) : (
                <div className="px-4 py-8 text-center">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <p className="text-gray-500 font-medium">No transactions found</p>
                    <p className="text-gray-400 text-sm">Try adjusting your filters</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </GlobalLayout>
  );
}

function MobileTransactionCard({ tx, user }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const getTypeLabel = (type) => {
    const base = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium';
    switch (type) {
      case 'issue': return `${base} bg-green-100 text-green-800`;
      case 'allocation': return `${base} bg-blue-100 text-blue-800`;
      case 'use': return `${base} bg-yellow-100 text-yellow-800`;
      case 'reclaim': return `${base} bg-red-100 text-red-800`;
      default: return `${base} bg-gray-100 text-gray-800`;
    }
  };

  return (
    <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {new Date(tx.createdAt).toLocaleDateString()}
          </p>
          <p className="text-xs text-gray-500">
            {new Date(tx.createdAt).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className='flex flex-col gap-1 items-center'>
            <span className='text-xs'>Type</span>
            <span className={getTypeLabel((tx.targetUser.userObjId === user.objId && tx.type === "allocation") ? "issue" :  tx.type)}>
              {(tx.targetUser.userObjId === user.objId && tx.type === "allocation") ? "Issue" : tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
            </span>
          </div>
          <div className='flex flex-col gap-1 items-center'>
            <span className='text-xs'>Amount</span>
            <p className={`text-sm font-semibold ${
              tx.type === 'issue' || 
              (tx.type === 'reclaim' && tx.performer?.userObjId === user.objId) || 
              (tx.type === 'allocation' && tx.targetUser?.userObjId === user.objId)
                ? 'text-green-600'
                : 'text-red-600'
            }`}>
              {tx.type === 'issue' || 
              (tx.type === 'reclaim' && tx.performer?.userObjId === user.objId) || 
              (tx.type === 'allocation' && tx.targetUser?.userObjId === user.objId)
                ? `+${tx.actualAmount}`
                : `-${tx.actualAmount}`}
            </p>
          </div>
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-500 hover:text-gray-700 transition p-1"
          >
            {isExpanded ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-gray-500">Performer</p>
              <p className="font-medium">
                {tx.performer?.userObjId === user.objId ? (
                  <span className="text-blue-600">You</span>
                ) : (
                  tx.performer?.id || tx.performer?.userObjId
                )}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Target</p>
              <p className="font-medium">
                {tx.targetUser?.id === user.id ? (
                  <span className="text-blue-600">You</span>
                ) : (
                  tx.targetUser?.id || 'QR'
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}