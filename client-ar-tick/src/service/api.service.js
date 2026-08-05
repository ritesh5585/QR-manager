import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

export const assignQR = async (qrId, checkedSquares) => {
  return (await api.patch(`/qr/assign/${qrId}`, { checkedSquares })).data;
};

export const qrDetails = async (qrId) => {
  return (await api.get(`/qr/details/${qrId}`)).data;
};

