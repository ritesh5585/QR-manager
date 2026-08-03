import AdminLayout from "../layouts/AdminLayout";
import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { CiViewTable } from "react-icons/ci";
import { 
  FiDownload, 
  FiEdit2, 
  FiSearch, 
  FiX, 
  FiCalendar, 
  FiPlus,
  FiChevronDown,
  FiChevronUp
} from "react-icons/fi";
import { RiResetRightLine } from "react-icons/ri";
import { toast } from "react-hot-toast"
import HierarchyTree from "../components/HierarchyTree";

// Download image helper
const downloadImage = async (svgUrl, fileName = "qr.png") => {
  try {
    const response = await fetch(svgUrl);
    const svgText = await response.text();

    const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      URL.revokeObjectURL(url);

      // Convert to PNG and download
      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    img.onerror = (e) => {
      console.error("Error loading SVG:", e);
    };

    img.src = url;
  } catch (err) {
    console.error("Failed to download as PNG:", err);
  }
};

export default function ManageQRs() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [qrListLoading, setQrListLoading] = useState(false);
  const [userData, setUserData] = useState(null);
  const [qrs, setQrs] = useState([]);
  const [filteredQrs, setFilteredQrs] = useState([]);
  const [selectedQR, setSelectedQR] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [creationDate, setCreationDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showHierarchy, setShowHierarchy] = useState(false);
  const [selectedUserObjId, setSelectedUserObjId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchQRs();
    fetchUserDetails();
  }, []);

  useEffect(() => {
    filterQrs();
  }, [qrs, searchTerm, statusFilter, creationDate, expiryDate]);

  const fetchQRs = async () => {
    setQrListLoading(true);
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/qr/allList?userObjId=${user.objId}`
      );
      setQrs(res.data);
      setQrListLoading(false);
    } catch (err) {
      setQrListLoading(false);
      console.error("Error fetching QRs", err);
    }
  };

  const fetchUserDetails = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/getUserDetails?userObjId=${user.objId}`);
      setUserData(res.data.user);
    } catch (err) {
      console.error("Error fetching credits", err);
    }
  };

  const handleFillDetails = (qrId) => {
    navigate(`/templates/${qrId}`);
  };

  const filterQrs = () => {
    let result = [...qrs];

    // Search by QR ID
    if (searchTerm) {
      result = result.filter(qr =>
        qr.qrId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        qr.creator?.id?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by status
    if (statusFilter !== "all") {
      result = result.filter(qr => qr.status === statusFilter);
    }

    // Filter by creation date
    if (creationDate) {
      const filterDate = new Date(creationDate);
      result = result.filter(qr => {
        const createdAt = new Date(qr.createdAt);
        return createdAt.toDateString() === filterDate.toDateString();
      });
    }

    // Filter by expiry date
    if (expiryDate) {
      const filterDate = new Date(expiryDate);
      result = result.filter(qr => {
        const expiryDate = new Date(qr.qrExpiry);
        return expiryDate.toDateString() === filterDate.toDateString();
      });
    }

    setFilteredQrs(result);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setCreationDate("");
    setExpiryDate("");
  };

  const handleCreateQR = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/qr/create`, {
        creator: {
          userObjId: user.objId,
          role: user.role,
        },
        type: "business_card"
      });

      setSelectedQR(response.data);
      setLoading(false);
      setShowCreateModal(false);
      fetchQRs();
    } catch (error) {
      setLoading(false);
      console.error("Failed to create QR:", error);
      toast.error("Failed to create QR code.", {id: "create-qr-failed"});
    }
  };

  const statusMap = {
    assigned: "Assigned",
    notAssigned: "Not Assigned",
    withdrawn: "Withdrawn",
  };

  return (
    <AdminLayout>
      <div className="space-y-2 lg:space-y-6 ">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">Manage QR Codes</h2>
            <p className="text-sm sm:text-md text-gray-500 mt-1">View and manage all your QR codes</p>
          </div>
          {userData && (
            <div className="flex items-start sm:items-center gap-3 w-full sm:w-auto">
              <button
                onClick={() => setShowCreateModal(true)}
                className="w-full sm:w-auto cursor-pointer flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-all hover:shadow-md whitespace-nowrap"
              >
                <FiPlus size={16} />
                Create New QR
              </button>
              <div className="w-full sm:w-auto flex gap-2 text-sm items-center justify-center px-4 py-2 bg-green-600 rounded-lg text-white font-medium shadow-sm whitespace-nowrap">
                <h3>Available Balance:</h3>
                <p>{userData.credits}</p>
              </div>
            </div>
          )}
        </div>

        {/* Filters - Mobile Toggle */}
        <div className="flex items-center gap-2 sm:hidden">
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="w-full flex items-center justify-between bg-white px-2 py-1 rounded-lg border border-gray-300 shadow-sm"
          >
            <span className="font-medium">Filters</span>
            {showMobileFilters ? <FiChevronUp /> : <FiChevronDown />}
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
        <div className={`bg-white rounded-xl p-4 shadow-sm ${showMobileFilters ? 'block' : 'hidden'} sm:block`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[1fr_1fr_2.2fr] gap-2 sm:gap-4">
            {/* Search */}
            <div className="relative sm:col-span-2 lg:col-span-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FiSearch className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search by QR ID or User ID"
                className="pl-10 pr-4 py-1 sm:py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={searchTerm}
                autoCorrect="off"
                spellCheck="false"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {/* Status Filter */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <label className="text-sm whitespace-nowrap">Status</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-4 py-1 sm:py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="assigned">Assigned</option>
                <option value="notAssigned">Not Assigned</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </div>
            {/* Date Filters & Reset Button */}
            <div className="grid grid-cols-2 sm:grid-cols-[repeat(2,minmax(0,1fr))_auto] gap-4 text-sm sm:text-md">
              {/* Creation Date Filter */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 ">
                <label className="text-sm whitespace-nowrap">Created</label>
                <input
                  type="date"
                  placeholder="Creation Date"
                  className="w-full border border-gray-300 rounded-lg px-1 sm:px-4 py-1 sm:py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={creationDate}
                  onChange={(e) => setCreationDate(e.target.value)}
                />
              </div>

              {/* Expiry Date Filter */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <label className="text-sm whitespace-nowrap">Expiry</label>
                <input
                  type="date"
                  placeholder="Expiry Date"
                  className="w-full border border-gray-300 rounded-lg px-1 sm:px-4 py-1 sm:py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
  
              {/* Clear Filters */}
              <div className="w-fit sm:flex items-end sm:items-center justify-center hidden">
                <button
                  onClick={clearFilters}
                  className="flex items-center justify-center cursor-pointer"
                  title="Reset all filters"
                >
                  <RiResetRightLine color="#7b6c65" size={30} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {qrListLoading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        )}


        {/* QR List */}
        {!qrListLoading && (
          filteredQrs.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center shadow-sm">
              <div className="text-gray-400 mb-4">
                <FiSearch size={48} className="mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-700 mb-1">No QR codes found</h3>
              <p className="text-gray-500">
                {qrs.length === 0 ? "You haven't created any QR codes yet." : "Try adjusting your search or filters."}
              </p>
              {qrs.length === 0 && (
                <button 
                  className="cursor-pointer mt-4 mx-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-all hover:shadow-md"
                  onClick={() => setShowCreateModal(true)}
                >
                  <FiPlus size={16} />
                  Create Your First QR
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Header - hidden on mobile */}
              <div className="hidden sm:grid grid-cols-1 md:grid-cols-13 gap-4 px-4 py-2 bg-gray-200 rounded-lg font-medium text-gray-700 text-sm">
                <div className="md:col-span-2">QR Code</div>
                <div className="md:col-span-1">QR ID</div>
                <div className="md:col-span-2">Created</div>
                <div className="md:col-span-2">Expires</div>
                <div className="md:col-span-1">Creator</div>
                <div className="md:col-span-1">Role</div>
                <div className="md:col-span-1">Status</div>
                <div className="md:col-span-3 text-right">Actions</div>
              </div>
              {filteredQrs.filter((qr) => qr.type === "business_card").map((qr) => (
                <div  
                  key={qr.qrId}
                  className="grid grid-cols-1 sm:grid-cols-13 gap-4 items-center bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition"
                >
                  {/* Desktop View */}
                  {/* QR Image */}
                  <div className="sm:col-span-2 flex items-center gap-3">
                    <img
                      src={qr.imageUrl}
                      alt="QR Preview"
                      className="hidden sm:block w-16 h-16 object-contain border rounded-lg cursor-pointer hover:ring-2 hover:ring-blue-500 transition"
                      onClick={() => setSelectedQR(qr)}
                    />
                  </div>

                  {/* QR Info - hidden on mobile */}
                  <div className="hidden sm:block md:col-span-1 text-sm">
                    <div className="text-gray-500">ID</div>
                    <div className="font-medium flex items-center gap-1">
                      {qr.qrId}
                    </div>
                  </div>
                  
                  <div className="hidden sm:block md:col-span-2 text-sm">
                    <div className="text-gray-500">Created</div>
                    <div className="font-medium flex items-center gap-1">
                      <FiCalendar size={14} className="text-gray-400" />
                      {new Date(qr.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="hidden sm:block md:col-span-2 text-sm">
                    <div className="text-gray-500">Expires</div>
                    <div className="font-medium flex items-center gap-1">
                      <FiCalendar size={14} className="text-gray-400" />
                      {new Date(qr.qrExpiry).toLocaleDateString()}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedUserObjId(qr.creator.userObjId);
                      setShowHierarchy(true);                    
                    }}
                    className="hidden sm:block md:col-span-1 text-sm text-left cursor-pointer"
                  >
                    <div className="text-gray-500">Creator</div>
                    <div className="w-fit font-medium flex items-center gap-1 px-2 text-xs py-1 bg-gray-300 rounded-full hover:bg-gray-400">
                      {qr.creator.id}
                    </div>
                  </button>

                  <div className="hidden sm:block md:col-span-1 text-sm">
                    <div className="text-gray-500">Role</div>
                    <div className="w-fit font-medium flex items-center gap-1 uppercase px-2 text-xs py-1 bg-blue-300 rounded-full">
                      {qr.creator.role}
                    </div>
                  </div>

                  <div className="hidden sm:block md:col-span-1 text-sm">
                    <div className="text-gray-500">Status</div>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                        qr.status === "assigned"
                          ? "bg-green-100 text-green-700"
                          : qr.status === "withdrawn"
                          ? "bg-blue-100 text-blue-700"
                          : qr.status === "notAssigned"
                          ? "bg-orange-100 text-orange-500"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {statusMap[qr.status] || "Not Assigned"}
                    </span>
                  </div>

                  <div className="hidden sm:flex sm:col-span-12 md:col-span-3 justify-end gap-2 mt-2 sm:mt-0">
                    <button 
                      onClick={() => downloadImage(qr.imageUrl, `qr-${qr._id}.png`)}
                      className="cursor-pointer w-full max-w-[120px] flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-1.5 px-3 rounded-lg text-sm transition-all hover:shadow-md"
                    >
                      <FiDownload size={14} />
                      <span className="whitespace-nowrap">Download</span>
                    </button>
                    {qr.status !== "assigned" && (
                      <button
                        className="cursor-pointer w-full max-w-[120px] flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-medium py-1.5 px-3 rounded-lg text-sm transition-all hover:shadow-md"
                        onClick={() => handleFillDetails(qr.qrId)}
                      >
                        <FiEdit2 size={14} />
                        <span>Fill Details</span>
                      </button>
                    )}

                    {qr?.status === "assigned" && qr?.finalUrl && (
                      <button
                        type="button"
                        className="cursor-pointer w-full max-w-[120px] flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-1.5 px-3 rounded-lg text-sm transition-all hover:shadow-md"
                        onClick={() => {
                          // Basic URL validation
                          if (qr.finalUrl.startsWith("http")) {
                            window.open(qr.finalUrl, "_blank");
                          } 
                        }}
                      >
                        <CiViewTable size={14} />
                        <span>View Card</span>
                      </button>
                    )}
                  </div>

                  {/* Mobile View */}
                  <div className="sm:hidden w-full">
                    {/* Top Row - QR and Details */}
                    <div className="flex flex-row w-full mb-3 gap-2">
                      {/* Left Column - QR Image */}
                      <div className="flex flex-col items-center gap-1 w-1/3">
                        <img
                          src={qr.imageUrl}
                          alt="QR Preview"
                          className="w-full p-2 object-contain border rounded-lg cursor-pointer hover:ring-2 hover:ring-blue-500 transition"
                          onClick={() => setSelectedQR(qr)}
                        />
                        
                      </div>

                      {/* Right Column - Details */}
                      <div className="flex flex-col gap-2 w-2/3  justify-between">
                        <div className="flex justify-between">
                          <div className="text-sm font-medium flex flex-col">
                            <span className="text-gray-500">ID</span> 
                            <span className="bg-gray-300 px-2 py-1 rounded-full text-xs">{qr.qrId}</span>
                          </div>
                          <div className="text-sm ">
                            <div className="text-gray-500">Status</div>
                            <div className="font-medium">
                              <span
                                className={`whitespace-nowrap inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                  qr.status === "assigned"
                                    ? "bg-green-100 text-green-700"
                                    : qr.status === "withdrawn"
                                    ? "bg-blue-100 text-blue-700"
                                    : qr.status === "notAssigned"
                                    ? "bg-orange-100 text-orange-500"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {statusMap[qr.status] || "Not Assigned"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-between text-xs">
                          <div className="bg-gray-200 p-1 rounded-md">
                            <div className="text-gray-500">Created</div>
                            <div className="font-medium flex items-center gap-1">
                              <FiCalendar size={14} className="text-gray-400" />
                              {new Date(qr.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div className=" bg-gray-200 p-1 rounded-md">
                            <div className="text-gray-500">Expires</div>
                            <div className="font-medium flex items-center gap-1">
                              <FiCalendar size={14} className="text-gray-400" />
                              {new Date(qr.qrExpiry).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between gap-2 text-xs mb-2">
                      <button
                        onClick={() => {
                          setSelectedUserObjId(qr.creator.userObjId);
                          setShowHierarchy(true);                    
                        }}
                        className="w-full bg-gray-200 p-1 rounded-md text-left"
                      >
                        <div className="text-gray-500">Creator</div>
                          <div className="font-medium flex items-center gap-1">
                            {qr.creator.id}
                          </div>
                      </button>
                      <div className="w-full bg-gray-200 p-1 rounded-md">
                        <div className="text-gray-500">Role</div>
                        <div className="font-medium flex items-center gap-1 uppercase">
                          {qr.creator.role}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row - Buttons */}
                    <div className="flex flex-row gap-2 w-full text-xs">
                      <button 
                        onClick={() => downloadImage(qr.imageUrl, `qr-${qr._id}.png`)}
                        className="cursor-pointer w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-3 rounded-lg transition-all hover:shadow-md"
                      >
                        <FiDownload size={14} />
                        <span>Download</span>
                      </button>
                      {qr.status !== "assigned" && (
                        <button
                          className="cursor-pointer w-full flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-medium py-1.5 px-3 rounded-lg text-sm transition-all hover:shadow-md"
                          onClick={() => handleFillDetails(qr.qrId)}
                        >
                          <FiEdit2 size={14} />
                          <span>Fill Details</span>
                        </button>
                      )}

                      {qr?.status === "assigned" && qr?.finalUrl && (
                        <button
                          type="button"
                          className="cursor-pointer w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-1.5 px-3 rounded-lg text-sm transition-all hover:shadow-md"
                          onClick={() => {
                            if (qr.finalUrl.startsWith("http")) {
                              window.open(qr.finalUrl, "_blank"); // Open in new tab
                            }
                          }}
                        >
                          <CiViewTable size={14} />
                          <span>View Card</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        }
      </div>

      {/* QR Details Modal - Responsive */}
      {selectedQR && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm relative shadow-lg animate-fade-in">
            <button
              className="cursor-pointer absolute top-4 right-4 text-gray-500 hover:text-gray-700 transition"
              onClick={() => setSelectedQR(null)}
            >
              <FiX size={24} />
            </button>

            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-800">QR Code Details</h3>
              <p className="text-sm font-semibold text-gray-500">ID: {selectedQR.qrId}</p>
            </div>

            <div className="flex mb-4 justify-between items-center gap-2">
              <img
                src={selectedQR.imageUrl}
                alt="QR Full"
                className="w-40 sm:w-50 h-auto object-contain border rounded-lg bg-gray-50 p-4"
              />
              <div className="flex flex-col justify-between gap-3 text-xs sm:text-sm">
                <div className="bg-gray-100 p-1 sm:p-2 rounded-lg">
                  <div className="text-gray-800 mb-1">Created</div>
                  <div className="font-medium">
                    {new Date(selectedQR.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="bg-gray-100 p-1 sm:p-2 rounded-lg text-xs sm:text-sm">
                  <div className="text-gray-500 mb-1">Expiry</div>
                  <div className="font-medium">
                    {new Date(selectedQR.qrExpiry).toLocaleDateString()}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg col-span-2 p-1 sm:p-2 text-xs sm:text-sm">
                  <div className="text-gray-500 mb-1">Status</div>
                  <div className="font-medium">
                    <span
                      className={`whitespace-nowrap inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                        selectedQR.status === "assigned"
                          ? "bg-green-100 text-green-700"
                          : selectedQR.status === "withdrawn"
                          ? "bg-blue-100 text-blue-700"
                          : selectedQR.status === "notAssigned"
                          ? "bg-orange-100 text-orange-500"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {statusMap[selectedQR.status] || "Not Assigned"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => downloadImage(selectedQR.imageUrl, `qr-${selectedQR._id}.png`)}
                className="cursor-pointer w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-all hover:shadow-md"
              >
                <FiDownload size={16} />
                Download
              </button>
              {selectedQR.status !== "assigned" && (
                <button
                  className="cursor-pointer w-full flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-medium py-1.5 px-3 rounded-lg text-sm transition-all hover:shadow-md"
                  onClick={() => handleFillDetails(selectedQR.qrId)}
                >
                  <FiEdit2 size={14} />
                  <span>Fill Details</span>
                </button>
              )}

              {selectedQR?.status === "assigned" && selectedQR?.finalUrl && (
                <button
                  type="button"
                  className="cursor-pointer w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-1.5 px-3 rounded-lg text-sm transition-all hover:shadow-md"
                  onClick={() => {
                    if (selectedQR.finalUrl.startsWith("http")) {
                      window.open(selectedQR.finalUrl, "_blank");
                    }
                  }}
                >
                  <CiViewTable size={14} />
                  <span>View Card</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create QR Modal - Responsive */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md relative shadow-lg animate-fade-in">
            <button
              className="cursor-pointer absolute top-4 right-4 text-gray-500 hover:text-gray-700 transition"
              onClick={() => setShowCreateModal(false)}
            >
              <FiX size={24} />
            </button>

            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-800">Confirm QR Code Creation</h3>
              {userData.credits >= 1 ? (
                <>
                  <p className="mt-2 text-sm text-gray-600">
                    This will <span className="font-semibold text-red-500">deduct 1 credit</span> from your account.
                  </p>
                  <p className="text-sm mt-1">
                    Available Balance: <span className="font-semibold text-green-600">{userData.credits}</span>
                  </p>
                </>
              ) : (
                <div className="mt-2 text-sm text-red-600">
                  <p className="font-medium">You don't have enough credits to create a QR.</p>
                  <p>Please contact your team head to get more credits.</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                className="w-full cursor-pointer flex items-center justify-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg text-sm transition-all hover:shadow-md"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>

              <button
                disabled={loading || userData.credits < 1}
                className={`w-full whitespace-nowrap flex items-center justify-center gap-2 ${
                  loading || userData.credits < 1
                    ? 'bg-blue-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                } text-white font-medium py-2 px-4 rounded-lg text-sm transition-all hover:shadow-md`}
                onClick={handleCreateQR}
              >
                {loading ? (
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    ></path>
                  </svg>
                ) : (
                  <>
                    <FiPlus size={16} />
                    Confirm & Create
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {showHierarchy && selectedUserObjId && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-50 flex items-center justify-center p-8"
          onClick={() => setShowHierarchy(false)}
        >
          <div
            className="bg-white rounded-lg shadow-lg p-4 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <HierarchyTree
              userObjId={selectedUserObjId}
              onClose={() => setShowHierarchy(false)}
            />
          </div>
        </div>
      )}
    </AdminLayout>
  );
}