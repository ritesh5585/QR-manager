import { useState, useCallback, useEffect } from "react";
import "react-image-crop/dist/ReactCrop.css";
import { toast } from "react-hot-toast";
import ImageCropper from "../imageCropper/ImageCropper";
import { MdOutlineArrowBack } from "react-icons/md";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { useAuth } from "../../contexts/AuthContext";

const Template1 = () => {
  const { user } = useAuth();
  const { qrId, templateId } = useParams();
  const [qrDetails, setQrDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    profileImage: "",
    name: "",
    role: "",
    hospital1: { name: "", visitingHours: "" },
    hospital2: { name: "", visitingHours: "" },
    hospital3: { name: "", visitingHours: "" },
    hospitalUrl: "",
    address: "",
    award1: "",
    award2: "",
    research: "",
    facebook: "",
    instagram: "",
    twitter: "",
    linkedIn: "",
    phone: "",
    email: "",
  });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchQRDetails = async () => {
      setLoading(true);
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/qr/details/${qrId}`
        );
        const data = res.data;
        setQrDetails(data);

        if (data?.status === "assigned" && data?.assignedDetails) {
          const details = data.assignedDetails;

          setFormData({
            profileImage: details.profileImage || "", // this will be an image key string
            name: details.name || "",
            role: details.role || "",
            hospital1: {
              name: details.hospital1?.name || "",
              visitingHours: details.hospital1?.visitingHours || "",
            },
            hospital2: {
              name: details.hospital2?.name || "",
              visitingHours: details.hospital2?.visitingHours || "",
            },
            hospital3: {
              name: details.hospital3?.name || "",
              visitingHours: details.hospital3?.visitingHours || "",
            },
            hospitalUrl: details.hospitalUrl || "",
            address: details.address || "",
            award1: details.award1 || "",
            award2: details.award2 || "",
            research: details.research || "",
            facebook: details.facebook || "",
            instagram: details.instagram || "",
            twitter: details.twitter || "",
            linkedIn: details.linkedIn || "",
            phone: details.phone || "",
            email: details.email || "",
          });
        }
        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch QR details:", error);
        setLoading(false);
      }
    };

    fetchQRDetails();
  }, [qrId]);

  const handleImageCropped = useCallback((blob) => {
    setFormData((prev) => ({
      ...prev,
      profileImage: blob,
    }));
  }, []);

  // Stable handleChange function
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;

    // Only nested hospital1.*, hospital2.* go here
    if (name.startsWith("hospital") && name.includes(".")) {
      const [hospital, field] = name.split(".");
      setFormData((prev) => ({
        ...prev,
        [hospital]: {
          ...prev[hospital],
          [field]: value,
        },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  }, []);

  // Stable InputField component
  const InputField = useCallback(
    ({
      label,
      name,
      value,
      onChange,
      maxLength,
      required = false,
      type = "text",
    }) => {
      return (
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          <div className="relative">
            <input
              type={type}
              name={name}
              value={value}
              onChange={onChange}
              maxLength={maxLength}
              className="text-sm w-full px-3 py-2 pr-12 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required={required}
            />
            {maxLength && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 bg-gray-100 px-1 rounded">
                {value.length}/{maxLength}
              </div>
            )}
          </div>
        </div>
      );
    },
    []
  );

  // Handle form submission
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setLoading(true);
      // Validate all fields
      const requiredFields = [
        formData.profileImage,
        formData.name,
        formData.role,
        formData.hospital1.name,
        formData.hospital2.name,
        formData.hospital3.name,
        formData.hospitalUrl,
        formData.facebook,
        formData.instagram,
        formData.twitter,
        formData.award2,
        formData.award2,
        formData.research,
        formData.address,
        formData.phone,
        formData.email,
      ];

      if (requiredFields.some((field) => !field)) {
        toast.error("Please fill all required fields", { id: "fields-error" });
        return;
      }

      try {
        let imageKey = null;

        if (formData.profileImage instanceof Blob) {
          // delete the previous image from s3 if new image is uploaded
          if (qrDetails.status === "assigned") {
            await axios.delete(
              `${import.meta.env.VITE_S3_URL}/deleteObjectqwiq?fileName=${
                qrDetails.assignedDetails.profileImage
              }`
            );
          }
          const fileName = `profile-${uuidv4()}.png`;
          const fileType = formData.profileImage.type;

          // Step 1: Get the presigned URL
          const presignedRes = await axios.post(
            `${import.meta.env.VITE_S3_URL}/getPresignedUrlqwiq`,
            {
              fileName,
              fileType,
            }
          );

          const { uploadUrl, key } = presignedRes.data;

          // Step 2: Upload to S3
          await axios.put(uploadUrl, formData.profileImage, {
            headers: {
              "Content-Type": fileType,
            },
          });

          imageKey = key; // Save this to include in your PATCH body
        }

        // retain the previous imagekey if no image is changed and qr status is assigned
        if (!imageKey && qrDetails?.status === "assigned") {
          imageKey = qrDetails?.assignedDetails?.profileImage;
        }

        // Step 3: Send PATCH to assign QR
        await axios.patch(`${import.meta.env.VITE_API_URL}/qr/assign/${qrId}`, {
          ...formData,
          profileImage: imageKey,
          templateId: `${templateId}`,
        });
        setLoading(false);
        toast.success(
          `Business card ${
            qrDetails?.status === "assigned" ? "updated" : "generated"
          } successfully`,
          { id: "success" }
        );
        window.open(`/business-card/card/${qrId}/${templateId}`, "_blank");
        if (user.role === "admin") {
          navigate("/admin/manageQRs");
        } else {
          navigate("/manageQRs");
        }
      } catch (error) {
        setLoading(false);
        console.error("Error assigning QR:", error);
        toast.error("Failed to generate business card", { id: "failed" });
      }
    },
    [formData]
  );

  const isFormValid =
    formData.profileImage &&
    formData.name &&
    formData.role &&
    formData.hospital1.name &&
    formData.hospital2.name &&
    formData.hospital3.name &&
    formData.hospitalUrl &&
    formData.facebook &&
    formData.instagram &&
    formData.twitter &&
    formData.linkedIn &&
    formData.award1 &&
    formData.award2 &&
    formData.research &&
    formData.address &&
    formData.phone &&
    formData.email;

  return (
    <div>
      <div className="space-y-2 md:space-y-6 max-w-4xl mx-auto sm:rounded-lg sm:shadow-2xl overflow-hidden">
        <div className="sm:p-8">
          <div className="flex items-center mb-4 sm:mb-8 gap-2 sm:gap-4">
            <button
              onClick={() => window.history.back()}
              className="p-2 bg-gray-300 rounded-full cursor-pointer"
            >
              <MdOutlineArrowBack />
            </button>
            <h1 className="text-md sm:text-xl font-bold text-gray-800">
              Business Card Details
            </h1>
          </div>
          <p className="text-xs sm:text-sm font-medium mb-2 text-gray-500">
            Fill the Details given below -{" "}
          </p>

          <form onSubmit={handleSubmit} className="space-y-2 md:space-y-6">
            {/* Profile Image with Crop */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Profile Image <span className="text-red-500">*</span>
              </label>
              <ImageCropper
                profileImage={qrDetails?.assignedDetails?.profileImage}
                onCropComplete={handleImageCropped}
              />
            </div>

            {/* Name */}
            <InputField
              label="Full Name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              maxLength={25}
              required
            />

            {/* Role */}
            <InputField
              label="Role/Profession"
              name="role"
              value={formData.role}
              onChange={handleChange}
              maxLength={30}
              required
            />

            {/* Hospital 1 */}
            <InputField
              label="Hospital 1 Name"
              name="hospital1.name"
              value={formData.hospital1.name}
              onChange={handleChange}
              maxLength={45}
              required
            />

            {/* Hospital 1 Visiting Hours */}
            <InputField
              label="Hospital 1 Visiting Hours"
              name="hospital1.visitingHours"
              value={formData.hospital1.visitingHours}
              onChange={handleChange}
            />

            {/* Hospital 2 */}
            <InputField
              label="Hospital 2 Name"
              name="hospital2.name"
              value={formData.hospital2.name}
              onChange={handleChange}
              maxLength={45}
              required
            />

            {/* Hospital 2 Visiting Hours */}
            <InputField
              label="Hospital 2 Visiting Hours"
              name="hospital2.visitingHours"
              value={formData.hospital2.visitingHours}
              onChange={handleChange}
            />

            {/* Hospital 3 */}
            <InputField
              label="Hospital 3 Name"
              name="hospital3.name"
              value={formData.hospital3.name}
              onChange={handleChange}
              maxLength={45}
              required
            />

            {/* Hospital 3 Visiting Hours */}
            <InputField
              label="Hospital 3 Visiting Hours"
              name="hospital3.visitingHours"
              value={formData.hospital3.visitingHours}
              onChange={handleChange}
            />

            {/* Hospital URL */}
            <InputField
              label="Hospital URL"
              name="hospitalUrl"
              value={formData.hospitalUrl}
              onChange={handleChange}
              maxLength={30}
              type="url"
              required
            />

            {/* Address */}
            <InputField
              label="Address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              maxLength={50}
              required
            />

            {/* Awards */}
            <InputField
              label="Awards and Recognition 1"
              name="award1"
              value={formData.award1}
              onChange={handleChange}
              maxLength={40}
              required
            />

            <InputField
              label="Awards and Recognition 2"
              name="award2"
              value={formData.award2}
              onChange={handleChange}
              maxLength={40}
              required
            />

            {/* Research */}
            <InputField
              label="Research and Publications"
              name="research"
              value={formData.research}
              onChange={handleChange}
              maxLength={40}
              required
            />

            {/* Social Media */}
            <InputField
              label="Facebook URL"
              name="facebook"
              value={formData.facebook}
              onChange={handleChange}
              maxLength={40}
              type="url"
              required
            />

            <InputField
              label="Instagram URL"
              name="instagram"
              value={formData.instagram}
              onChange={handleChange}
              maxLength={40}
              type="url"
              required
            />

            <InputField
              label="Twitter URL"
              name="twitter"
              value={formData.twitter}
              onChange={handleChange}
              maxLength={40}
              type="url"
              required
            />

            <InputField
              label="LinkedIn URL"
              name="linkedIn"
              value={formData.linkedIn}
              onChange={handleChange}
              maxLength={40}
              type="url"
              required
            />

            {/* Contact Info */}
            <InputField
              label="Phone Number"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              maxLength={10}
              type="tel"
              required
            />

            <InputField
              label="Email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              maxLength={40}
              type="email"
              required
            />

            {/* Submit Button */}
            <div className="pt-4 w-full flex justify-center">
              <button
                type="submit"
                disabled={!isFormValid || loading}
                className={`w-full rounded-full max-w-1/2 flex justify-center items-center gap-2 px-2 py-2 sm:px-4 sm:py-2 border border-transparent shadow-sm text-sm font-medium text-white transition-colors
                  ${
                    isFormValid
                      ? "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 cursor-pointer"
                      : "bg-gray-400 cursor-not-allowed"
                  }
                `}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : qrDetails?.status === "assigned" ? (
                  "Update Details"
                ) : (
                  "Generate Business Card"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Template1;
