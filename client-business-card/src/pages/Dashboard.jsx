import GlobalLayout from '../layouts/GlobalLayout';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from "react-hot-toast";

export default function DashBoard() {
  const [data, setData] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    async function getReport() {
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/credits/balance?userObjId=${user.objId}`
        );
        setData(response.data);
      } catch (error) {
        toast.error('Failed to load data! Please try again.', { id: "load-error" });
      }
    }

    if (user?.objId) getReport();
  }, [user]);

  function formatDate(input) {
    const date = new Date(input);
    const options = { day: 'numeric', month: 'long' };
    const dayMonth = date.toLocaleDateString('en-GB', options);
    const year = date.getFullYear();
    return `${dayMonth}, ${year}`;
  }


  return (
    <GlobalLayout>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-gray-800">Overview</h2>
        {data && (
          <div className="flex gap-2 items-center px-4 py-2 bg-green-600 rounded-xl text-white font-medium shadow-sm">
            <h3>Current Balance:</h3>
            <p>{data.currentCredits}</p>
          </div>
        )}
      </div>

      {data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <StatCard title="Total Credits Issued" value={data.totalIssued} />
          <StatCard title="Total Allocated Credits" value={data.totalAllocated} />
          <StatCard title="Total Reclaimed Credits" value={data.totalReclaimed} />
          <StatCard title="QRs Created" value={data.totalUsed} />
          <StatCard title="Credit Expiry" value={formatDate(data.creditExpiry)} />
        </div>
      ) : (
        <p className="text-gray-500">Loading report...</p>
      )}
    </GlobalLayout>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="p-4 bg-white rounded-lg shadow-sm border">
      <h3 className="text-sm font-medium text-gray-500">{title}</h3>
      <p className="text-2xl font-bold text-blue-700 mt-1">{value}</p>
    </div>
  );
}
