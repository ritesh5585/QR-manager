import { useState, useEffect } from "react";
import axios from "axios";
import { FiX } from "react-icons/fi"; // Close icon

const roleOrder = ["admin", "tlm", "slm", "flm", "mr"];

const roleLabels = {
  admin: "Admin",
  tlm: "TLM",
  slm: "SLM",
  flm: "FLM",
  mr: "MR",
};

const HierarchyTree = ({ userObjId, onClose }) => {
  const [hierarchy, setHierarchy] = useState(null);

  useEffect(() => {
    if (!userObjId) return;
    axios
      .get(`${import.meta.env.VITE_API_URL}/hierarchy?userObjId=${userObjId}`)
      .then((res) => setHierarchy(res.data))
      .catch((err) => console.error("Error fetching hierarchy", err));
  }, [userObjId]);

  if (!hierarchy) {
    return (
      <div className="p-6 relative max-w-md mx-auto bg-white shadow-md rounded-lg border border-gray-200">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          <FiX size={20} />
        </button>
        <div className="text-sm text-gray-500">Loading hierarchy...</div>
      </div>
    );
  }

  const levels = roleOrder.filter((role) => hierarchy[role]);

  return (
    <div className="p-6 relative max-w-md mx-auto bg-white shadow-md rounded-lg border border-gray-200">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 cursor-pointer"
      >
        <FiX size={18} />
      </button>
      <h2 className="text-lg font-semibold text-gray-700 mb-4">Hierarchy Tree</h2>
      <div className="relative pl-6">
        {levels.map((role, index) => (
          <div key={role} className="relative pb-6">
            {index < levels.length - 1 && (
              <div className="absolute left-2 top-6 bottom-0 w-0.5 bg-gray-300"></div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white relative z-10"></div>
              <div>
                <div className="text-sm font-semibold text-gray-800">
                  {roleLabels[role]} ({hierarchy[role].id})
                </div>
                <div className="text-sm text-gray-500">{hierarchy[role].name}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HierarchyTree;
