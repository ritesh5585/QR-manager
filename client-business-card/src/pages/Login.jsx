import { useState, useRef, useEffect } from "react";
import { toast } from "react-hot-toast";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";

export default function Login() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const userIdRef = useRef(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // console.log(location)

  useEffect(() => {
    userIdRef.current?.focus();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!userId || !password) {
      toast.error("Please enter both User ID and Password", {
        id: "validation-error",
      });
      return;
    }

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/login`,
        {
          id: userId,
          password: password,
        },
      );

      const data = response.data;
      login(data.user);
      const redirectUrl =
        data.user.role === "admin" ? "/admin/dashboard" : "/dashboard";
      const from = location.state?.from || redirectUrl;
      toast.success("Login successful!", { id: "login-success" });
      // clear the manual logout item from local storage if present
      localStorage.removeItem("isManualLogout");
      // navigate to final url
      navigate(from, { replace: true });
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error("Invalid credentials", { id: "login-failed" });
      } else {
        toast.error("Something went wrong! Please try again", {
          id: "login-failed",
        });
      }
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-tr from-white to-blue-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 sm:p-10 border border-gray-200">
        <h2 className="text-3xl font-bold text-center text-blue-700 mb-2">
          Login
        </h2>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label
              htmlFor="userId"
              className="block mb-1 text-sm font-medium text-gray-700"
            >
              User ID
            </label>
            <input
              ref={userIdRef}
              type="text"
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter your User ID"
              className="w-full px-4 py-2 text-gray-800 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block mb-1 text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="w-full px-4 py-2 text-gray-800 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm transition duration-200 cursor-pointer"
          >
            Login
          </button>
        </form>

        <p className="text-xs text-center text-gray-400 mt-6">
          © 2025 DigiLateral Solutions — All rights reserved
        </p>
      </div>
    </div>
  );
}
