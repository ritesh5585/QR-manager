import AdminLayout from '../layouts/AdminLayout';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { IoMdCreate, IoIosCheckmarkCircle } from "react-icons/io";
import { RxCrossCircled } from "react-icons/rx";
import { FiSearch, FiChevronUp, FiChevronDown } from "react-icons/fi";
import { GrRevert } from "react-icons/gr";

export default function ManageCredits() {
  const { user } = useAuth();
  const [userData, setUserData] = useState(null);
  const [subordinates, setSubordinates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const getUserData = async () => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/credits/balance?userObjId=${user.objId}`
      );
      setUserData(response.data);
    } catch (error) {
      toast.error('Failed to load data! Please try again.', { id: "load-error" });
    }
  };

  useEffect(() => {
    async function fetchSubordinates() {
      setIsLoading(true);
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL}/getSubordinates?userObjId=${user.objId}`);
        setUserData(res.data.user);
        const enriched = res.data.subordinates.map((u) => ({
          ...u,
          editing: false,
          newCredit: u.credits,
          isExpanded: false
        }));
        setSubordinates(enriched);
      } catch (err) {
        toast.error('Failed to fetch subordinates', {id: "load-error"});
      } finally {
        setIsLoading(false);
      }
    }
    if (user?.objId) fetchSubordinates();
  }, [user]);

  const filteredSubordinates = subordinates.filter((usr) =>
    usr.id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleUpdate = async (userObjId, newCredit, index) => {
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/credits/sync`, {
        targetUserId: userObjId,
        updatedCredit: parseInt(newCredit),
        performedBy: { userObjId: user.objId, role: user.role },
      });

      toast.success('Credits updated successfully', {id: "update-success"});

      const res = await axios.get(`${import.meta.env.VITE_API_URL}/credits/getUpdatedTransactionDetails?userObjId=${userObjId}`);
      const updatedUser = res.data.user;
      
      const updated = [...subordinates];
      updated[index] = {
        ...updatedUser,
        newCredit: updatedUser.credits,
        isExpanded: subordinates[index].isExpanded
      };
      setSubordinates(updated);
      await getUserData();

    } catch (err) {
      toast.error('Failed to update credits', {id: "update-error"});
    }
  };


  const toggleExpand = (userId) => {
    setSubordinates(prev => prev.map(u => 
      u._id === userId ? {...u, isExpanded: !u.isExpanded} : u
    ));
  };

  return (
    <AdminLayout>
      <div className="space-y-3 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Manage Credits</h2>
            <p className="text-sm sm:text-md text-gray-500 mt-1">View and update credit balances for your team</p>
          </div>
          {userData && (
            <div className="flex gap-2 items-center px-4 py-2 bg-green-600 rounded-xl text-white font-medium shadow-sm whitespace-nowrap">
              <h3>Available Balance:</h3>
              <p>{userData.currentCredits}</p>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        {userData ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard title="Total Issued" value={userData.totalIssued} />
            <StatCard title="Total Allocated" value={userData.totalAllocated} />
            <StatCard title="Total Reclaimed" value={userData.totalReclaimed} />
            <StatCard title="QRs Created" value={userData.totalUsed} />
          </div>
        ) : (
          <p className="text-gray-500">Loading stats...</p>
        )}

        {/* Search and Controls */}
        <div className="flex justify-between gap-3">
          <div className="relative w-full sm:w-auto">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FiSearch className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search by User ID"
              className="pl-10 pr-4 py-1 sm:py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={() => {
              setSubordinates(prev => prev.map(u => ({
                ...u,
                editing: false,
                newCredit: u.credits,
                isExpanded: false
              })));
              setSearchTerm("");
            }}
            className="whitespace-nowrap cursor-pointer px-4 py-1 sm:py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 border border-gray-300 rounded-lg hover:shadow-sm transition flex items-center justify-center gap-2"
          >
            <GrRevert />
            <span>Revert All</span>
          </button>
        </div>

        {/* Mobile Cards */}
        <div className="sm:hidden space-y-3">
          {isLoading ? (
            <div className="flex justify-center p-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
            </div>
          ) : filteredSubordinates.length > 0 ? (
            filteredSubordinates.map((usr, idx) => (
              <div key={usr._id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                      <span className="text-blue-600 font-medium text-sm">
                        {usr.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{usr.name}</h3>
                      <p className="text-xs text-gray-500 truncate">ID: {usr.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Balance</p>
                      <p className="font-medium text-blue-600">{usr.credits}</p>
                    </div>
                    <button 
                      onClick={() => toggleExpand(usr._id)}
                      className="text-gray-500 hover:text-gray-700 transition p-1"
                    >
                      {usr.isExpanded ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {usr.isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500">Role</p>
                        <p className="font-medium uppercase">{usr.role.toLowerCase()}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">HQ</p>
                        <p className="font-medium capitalize">{usr.hq.toLowerCase()}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Zone</p>
                        <p className="font-medium capitalize">{usr.zone.toLowerCase()}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Used</p>
                        <p className="font-medium">{usr.totalUsed || 0}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-gray-500">Allocated</p>
                          <p className="font-medium">{usr.allocated ?? 0}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Used</p>
                          <p className="font-medium">{usr.used ?? 0}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Reclaimed</p>
                          <p className="font-medium">{usr.reclaimed ?? 0}</p>
                        </div>
                      </div>

                      {usr.editing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            value={usr.newCredit}
                            onChange={(e) => {
                              const updated = [...subordinates];
                              updated[idx].newCredit = e.target.value;
                              setSubordinates(updated);
                            }}
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleUpdate(usr._id, usr.newCredit, idx)}
                              disabled={Number(usr.newCredit) === Number(usr.credits)}
                              className={`p-2 rounded-md ${
                                Number(usr.newCredit) === Number(usr.credits) 
                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                                  : "bg-green-100 text-green-600 hover:bg-green-200 cursor-pointer"
                              }`}
                            >
                              <IoIosCheckmarkCircle size={20} />
                            </button>
                            <button
                              onClick={() => {
                                const updated = [...subordinates];
                                updated[idx].editing = false;
                                updated[idx].newCredit = usr.credits;
                                setSubordinates(updated);
                              }}
                              className="p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-md"
                            >
                              <RxCrossCircled size={18} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            const updated = [...subordinates];
                            updated[idx].editing = true;
                            updated[idx].newCredit = usr.credits;
                            setSubordinates(updated);
                          }}
                          className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-blue-200 hover:bg-blue-100 text-blue-600 rounded-md transition"
                        >
                          <IoMdCreate size={16} />
                          <span>Update Credits</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No subordinates found.
            </div>
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden sm:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="relative overflow-auto max-h-[calc(100vh-360px)]">
            <table className="min-w-full divide-y divide-gray-200">
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[15%]" />
                <col className="w-[5%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th scope="col" className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th scope="col" className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    HQ
                  </th>
                  <th scope="col" className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Zone
                  </th>
                  <th scope="col" className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Allocated
                  </th>
                  <th scope="col" className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Used
                  </th>
                  <th scope="col" className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reclaimed
                  </th>
                  <th scope="col" className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                  <th scope="col" className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Set Credit
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSubordinates.map((usr, idx) => (
                  <tr key={usr._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 whitespace-nowrap text-center text-sm text-gray-900">
                      {usr.id}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                      {usr.name}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-center text-sm text-gray-500 uppercase">
                      {usr.role}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-center text-sm text-gray-500 capitalize">
                      {usr.hq}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-center text-sm text-gray-500 capitalize">
                      {usr.zone}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-center text-sm text-gray-500">
                      {usr.allocated ?? 0}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-center text-sm text-gray-500">
                      {usr.used ?? 0}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-center text-sm text-gray-500">
                      {usr.reclaimed ?? 0}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-center text-sm font-medium text-gray-900">
                      {usr.credits}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-center">
                      {usr.editing ? (
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="number"
                            min={0}
                            className="w-full max-w-[70px] p-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            value={usr.newCredit}
                            onChange={(e) => {
                              const updated = [...subordinates];
                              updated[idx].newCredit = e.target.value;
                              setSubordinates(updated);
                            }}
                          />
                          <button
                            onClick={() => handleUpdate(usr._id, usr.newCredit, idx)}
                            disabled={Number(usr.newCredit) === Number(usr.credits)}
                            className={`text-blue-600 hover:text-green-800 transition ${
                              Number(usr.newCredit) === Number(usr.credits) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                            }`}
                          >
                            <IoIosCheckmarkCircle size={30} />
                          </button>
                          <button
                            onClick={() => {
                              const updated = [...subordinates];
                              updated[idx].editing = false;
                              updated[idx].newCredit = usr.credits;
                              setSubordinates(updated);
                            }}
                            className="text-black-500 hover:text-red-700 transition cursor-pointer"
                          >
                            <RxCrossCircled size={20} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            const updated = [...subordinates];
                            updated[idx].editing = true;
                            updated[idx].newCredit = usr.credits;
                            setSubordinates(updated);
                          }}
                          className="cursor-pointer text-gray-500 hover:text-gray-700 p-1.5 hover:bg-black/20 hover:backdrop-blur-[1px] rounded-full"
                        >
                          <IoMdCreate size={20} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="p-3 sm:p-4 bg-white rounded-lg shadow-sm border">
      <h3 className="text-xs sm:text-sm font-medium text-gray-500">{title}</h3>
      <p className="text-xl sm:text-2xl font-bold text-blue-700 mt-1">{value}</p>
    </div>
  );
}