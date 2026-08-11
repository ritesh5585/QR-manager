import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    "ngrok-skip-browser-warning": "true",
  },
});

export const assignQR = async (qrId, checkedSquares) => {
  return (await api.patch(`/qr/assign/${qrId}`, checkedSquares)).data;
};

export const qrDetails = async (qrId) => {
  return (await api.get(`/qr/details/${qrId}`)).data;
};